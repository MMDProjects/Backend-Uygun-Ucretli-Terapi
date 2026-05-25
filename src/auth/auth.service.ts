import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDanisanDto } from './dto/register-danisan.dto';
import { RegisterUzmanDto } from './dto/register-uzman.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  async registerDanisan(dto: RegisterDanisanDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Bu e-posta zaten kayıtlı');

    const hash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        passwordHash: hash,
        role: 'DANISAN',
      },
    });

    return this.generateTokens(user.id, user.email, user.role, {
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  async registerUzman(
    dto: RegisterUzmanDto,
    files: { certificate?: Express.Multer.File[]; cv?: Express.Multer.File[] },
  ) {
    if (!files.certificate?.[0]) throw new BadRequestException('Sertifika PDF zorunludur');
    if (!files.cv?.[0]) throw new BadRequestException('CV PDF zorunludur');

    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Bu e-posta zaten kayıtlı');

    const hash = await bcrypt.hash(dto.password, 12);
    const certificateUrl = `/uploads/certificates/${files.certificate[0].filename}`;
    const cvUrl = `/uploads/cvs/${files.cv[0].filename}`;

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        passwordHash: hash,
        role: 'UZMAN',
        expertProfile: {
          create: {
            title: dto.title,
            certificateUrl,
            cvUrl,
            status: 'TASLAK',
          },
        },
      },
    });

    return this.generateTokens(user.id, user.email, user.role, {
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Geçersiz kimlik bilgileri');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Geçersiz kimlik bilgileri');

    return this.generateTokens(user.id, user.email, user.role, {
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  async refresh(userId: string, oldRefreshToken: string) {
    await this.prisma.refreshToken.delete({ where: { token: oldRefreshToken } });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    return this.generateTokens(user.id, user.email, user.role, {
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    return { message: 'Çıkış yapıldı' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return { message: 'Eğer e-posta kayıtlıysa sıfırlama bağlantısı gönderildi' };

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 dakika

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });

    await this.mail.sendPasswordReset(user.email, user.firstName, token);
    return { message: 'Eğer e-posta kayıtlıysa sıfırlama bağlantısı gönderildi' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpires: { gt: new Date() },
      },
    });
    if (!user) throw new BadRequestException('Geçersiz veya süresi dolmuş token');

    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return { message: 'Şifre başarıyla güncellendi' };
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    userMeta?: { firstName: string; lastName: string },
  ) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES'),
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES'),
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email,
        role,
        firstName: userMeta?.firstName ?? '',
        lastName: userMeta?.lastName ?? '',
      },
    };
  }
}
