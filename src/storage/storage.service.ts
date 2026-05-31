import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { extname } from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(private config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = this.config.get<string>('MINIO_PORT', '9000');

    this.s3 = new S3Client({
      endpoint: `http://${endpoint}:${port}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('MINIO_ROOT_USER', 'psikoadmin'),
        secretAccessKey: this.config.get<string>('MINIO_ROOT_PASSWORD', ''),
      },
      forcePathStyle: true,
    });

    this.bucket = this.config.get<string>('MINIO_BUCKET', 'psiko-uploads');
    this.publicUrl = this.config.get<string>('MINIO_PUBLIC_URL', `http://localhost:${port}`);
  }

  async onModuleInit() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" mevcut.`);
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        await this.s3.send(
          new PutBucketPolicyCommand({
            Bucket: this.bucket,
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: '*',
                  Action: 's3:GetObject',
                  Resource: `arn:aws:s3:::${this.bucket}/*`,
                },
              ],
            }),
          }),
        );
        this.logger.log(`Bucket "${this.bucket}" oluşturuldu ve public yapıldı.`);
      } catch (err) {
        this.logger.error('MinIO bucket oluşturulamadı:', err);
      }
    }
  }

  async upload(
    folder: 'avatars' | 'certificates' | 'cvs',
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    const ext = extname(file.originalname) || (file.mimetype === 'application/pdf' ? '.pdf' : '.bin');
    const key = `${folder}/${userId}-${Date.now()}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return `${this.publicUrl}/${this.bucket}/${key}`;
  }

  async deleteByUrl(url: string): Promise<void> {
    try {
      const key = url.split(`/${this.bucket}/`)[1];
      if (!key) return;
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      // Silme hatası sessizce geç
    }
  }
}
