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
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { StorageService } from '../storage/storage.service';
import { RegisterDanisanDto } from './dto/register-danisan.dto';
import { RegisterUzmanDto } from './dto/register-uzman.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
    private storage: StorageService,
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

    const tokens = this.generateTokens(user.id, user.email, user.role, {
      firstName: user.firstName,
      lastName: user.lastName,
    });

    this.mail.sendWelcomeDanisan(user.email, user.firstName).catch(() => {});

    return tokens;
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
    const tempId = `reg-${Date.now()}`;
    const certificateUrl = await this.storage.upload('certificates', files.certificate[0], tempId);
    const cvUrl = await this.storage.upload('cvs', files.cv[0], tempId);

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
            bio: dto.bio ?? '',
            education: dto.education ?? '',
            city: dto.city,
            district: dto.district,
            age: dto.age,
            gender: dto.gender,
            website: dto.website,
            instagram: dto.instagram,
            experienceDuration: dto.experienceDuration,
            registrationCertificates: dto.registrationCertificates,
            certificateUrl,
            cvUrl,
            status: 'ONAY_BEKLIYOR',
            ...(dto.tagIds?.length && {
              tags: { connect: dto.tagIds.map((id) => ({ id })) },
            }),
          },
        },
      },
      include: { expertProfile: true },
    });

    const tokens = this.generateTokens(user.id, user.email, user.role, {
      firstName: user.firstName,
      lastName: user.lastName,
    });

    const fullName = `${user.firstName} ${user.lastName}`.trim();
    this.mail.sendNewExpertApplicationAdmin(fullName, user.email).catch(() => {});

    return tokens;
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
    try {
      await this.prisma.refreshToken.delete({ where: { token: oldRefreshToken } });
    } catch (e) {
      // Eşzamanlı iki refresh isteği aynı token'ı kullanırsa, ikincisi burada
      // "kayıt bulunamadı" hatası alır çünkü token ilk istek tarafından zaten silinmiştir.
      // Bunu 500 yerine düzgün bir 401'e çeviriyoruz.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new UnauthorizedException('Refresh token geçersiz veya zaten kullanılmış');
      }
      throw e;
    }

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

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı');
    const { passwordHash, passwordResetToken, passwordResetExpires, ...safe } = user;
    return safe;
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    const { passwordHash, passwordResetToken, passwordResetExpires, ...safe } = updated;
    return safe;
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    userMeta?: { firstName: string; lastName: string },
  ) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_EXPIRES') },
    );

    const refreshToken = this.jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      { secret: this.config.get('JWT_REFRESH_SECRET'), expiresIn: this.config.get('JWT_REFRESH_EXPIRES') },
    );

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
