/**
 * Auth e2e testleri.
 * bcrypt.hash(12) yavaÅŸ olduÄŸundan, login testi iÃ§in Ã¶nceden hash hesaplanÄ±r.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

import { AuthModule } from '../src/auth/auth.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { buildPrismaMock, MOCK_DANISAN_ID, mockDanisanUser } from './helpers/prisma-mock';
import { TEST_JWT_SECRET, danisanToken, bearerHeader } from './helpers/auth.helper';

// ENV â€” JwtStrategy constructor'da okunur, compile Ã¶ncesi set edilmeli
process.env.JWT_ACCESS_SECRET   = TEST_JWT_SECRET;
process.env.JWT_REFRESH_SECRET  = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES  = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;
  let validPasswordHash: string;

  const mailMock = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendContactConfirmation: jest.fn().mockResolvedValue(undefined),
    sendWelcome: jest.fn().mockResolvedValue(undefined),
  };

  const validRegisterPayload = {
    firstName: 'Ahmet',
    lastName: 'YÄ±lmaz',
    email: 'ahmet@test.com',
    phone: '05321234567',
    password: 'Test1234!',
    kvkkConsent: true,
  };

  beforeAll(async () => {
    // Åifre hash'ini Ã¶nceden hesapla â€” login testlerinde kullanÄ±lÄ±r
    validPasswordHash = await bcrypt.hash('Test1234!', 10); // dÃ¼ÅŸÃ¼k maliyet

    prismaMock = buildPrismaMock();

    // refreshToken.create mock â€” generateTokens her login/register'da Ã§aÄŸÄ±rÄ±r
    prismaMock.refreshToken.create.mockResolvedValue({
      id: 'rt-1',
      token: 'mock-refresh-token',
      userId: MOCK_DANISAN_ID,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,   // @Global() — makes PrismaService available; overrideProvider replaces it
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({}),
        AuthModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(MailService)
      .useValue(mailMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // refreshToken.create her testten sonra temiz Ã§alÄ±ÅŸmalÄ±
    prismaMock.refreshToken.create.mockResolvedValue({
      id: 'rt-1',
      token: 'mock-refresh-token',
      userId: MOCK_DANISAN_ID,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  });

  // â”€â”€ POST /auth/register/danisan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /auth/register/danisan', () => {
    it('should register a new DANISAN and return tokens', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null); // e-posta yok
      prismaMock.user.create.mockResolvedValue({
        ...mockDanisanUser(),
        id: MOCK_DANISAN_ID,
        email: validRegisterPayload.email,
      });

      const res = await request(app.getHttpServer())
        .post('/auth/register/danisan')
        .send(validRegisterPayload)
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toHaveProperty('role', 'DANISAN');
    });

    it('should return 409 when email is already registered', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockDanisanUser());

      await request(app.getHttpServer())
        .post('/auth/register/danisan')
        .send(validRegisterPayload)
        .expect(409);
    });

    it('should return 400 when email is missing', async () => {
      const { email: _, ...withoutEmail } = validRegisterPayload;

      await request(app.getHttpServer())
        .post('/auth/register/danisan')
        .send(withoutEmail)
        .expect(400);
    });

    it('should return 400 when password is too short (< 8 chars)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register/danisan')
        .send({ ...validRegisterPayload, password: 'kisa' })
        .expect(400);
    });

    it('should return 400 when kvkkConsent is false', async () => {
      await request(app.getHttpServer())
        .post('/auth/register/danisan')
        .send({ ...validRegisterPayload, kvkkConsent: false })
        .expect(400);
    });

    it('should return 400 when phone format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/register/danisan')
        .send({ ...validRegisterPayload, phone: '123' })
        .expect(400);
    });
  });

  // â”€â”€ POST /auth/login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /auth/login', () => {
    it('should return tokens on successful login', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockDanisanUser(),
        passwordHash: validPasswordHash,
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'danisan@test.com', password: 'Test1234!' })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user).toHaveProperty('email', 'danisan@test.com');
    });

    it('should return 401 when password is wrong', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockDanisanUser(),
        passwordHash: validPasswordHash,
      });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'danisan@test.com', password: 'YanlisÅifre!' })
        .expect(401);
    });

    it('should return 401 when email does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'yok@test.com', password: 'Test1234!' })
        .expect(401);
    });

    it('should return 401 when user is inactive', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockDanisanUser(),
        passwordHash: validPasswordHash,
        isActive: false,
      });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'danisan@test.com', password: 'Test1234!' })
        .expect(401);
    });

    it('should return 400 when email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'gecersiz', password: 'Test1234!' })
        .expect(400);
    });
  });

  // â”€â”€ POST /auth/logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /auth/logout', () => {
    it('should logout by deleting refresh token', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockDanisanUser());
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', bearerHeader(danisanToken()))
        .send({ refreshToken: 'some-refresh-token' })
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('should succeed even when refresh token does not exist (idempotent)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockDanisanUser());
      prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', bearerHeader(danisanToken()))
        .send({ refreshToken: 'olmayan-token' })
        .expect(201);
    });

    it('should return 401 when no auth token provided', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: 'some-token' })
        .expect(401);
    });
  });

  // â”€â”€ POST /auth/forgot-password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /auth/forgot-password', () => {
    it('should return generic success message regardless of email existence (security)', async () => {
      // E-posta var
      prismaMock.user.findUnique.mockResolvedValue(mockDanisanUser());
      prismaMock.user.update.mockResolvedValue(mockDanisanUser());

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'danisan@test.com' })
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(mailMock.sendPasswordReset).toHaveBeenCalledTimes(1);
    });

    it('should return same generic message when email not found (no user enumeration)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'yok@test.com' })
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(mailMock.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('should return 400 when email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'gecersiz' })
        .expect(400);
    });
  });

  // â”€â”€ POST /auth/reset-password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        ...mockDanisanUser(),
        passwordResetToken: 'valid-token-abc',
        passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000), // 10 dk geÃ§erli
      });
      prismaMock.user.update.mockResolvedValue(mockDanisanUser());

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'valid-token-abc', newPassword: 'YeniSifre123!' })
        .expect(201);

      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when reset token is invalid or expired', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null); // token bulunamadÄ±

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'gecersiz-token', newPassword: 'YeniSifre123!' })
        .expect(400);
    });

    it('should return 400 when newPassword is too short', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'valid-token', newPassword: 'kisa' })
        .expect(400);
    });

    it('should return 400 when token field is missing', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ newPassword: 'YeniSifre123!' })
        .expect(400);
    });
  });
});
