/**
 * POST /auth/refresh e2e testleri — rotasyon + hoşgörü penceresi (grace window).
 *
 * Akış iki katmanlı çalışır:
 *   1) JwtRefreshStrategy: JWT imza doğrulaması + DB'de token kaydı ve pencere kontrolü
 *   2) AuthService.refresh: atomik soft-revoke (updateMany) + pencere içi tekrar kullanım
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';

import { AuthModule } from '../src/auth/auth.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { StorageModule } from '../src/storage/storage.module';
import { StorageService } from '../src/storage/storage.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { buildPrismaMock, MOCK_DANISAN_ID, mockDanisanUser } from './helpers/prisma-mock';
import { TEST_JWT_SECRET } from './helpers/auth.helper';
import { REFRESH_GRACE_MS } from '../src/auth/auth.constants';

// ENV — strategy constructor'ları compile öncesi okur
process.env.JWT_ACCESS_SECRET   = TEST_JWT_SECRET;
process.env.JWT_REFRESH_SECRET  = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES  = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';

/** Geçerli imzalı refresh JWT üretir (jwt-refresh strategy imzayı doğrular). */
function signRefreshJwt(): string {
  return jwt.sign(
    { sub: MOCK_DANISAN_ID, email: 'danisan@test.com', role: 'DANISAN' },
    'test-refresh-secret',
    { expiresIn: '7d' },
  );
}

describe('Auth refresh rotation + grace window (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  const mailMock = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendContactConfirmation: jest.fn().mockResolvedValue(undefined),
    sendWelcome: jest.fn().mockResolvedValue(undefined),
  };

  function storedTokenRow(token: string, overrides: Record<string, unknown> = {}) {
    return {
      id: 'rt-1',
      token,
      userId: MOCK_DANISAN_ID,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      revokedAt: null as Date | null,
      ...overrides,
    };
  }

  beforeAll(async () => {
    prismaMock = buildPrismaMock();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        StorageModule, // @Global() — AuthService'in StorageService bağımlılığı için
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
      .overrideProvider(StorageService)
      .useValue({ uploadFile: jest.fn(), deleteFile: jest.fn() })
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
    prismaMock.user.findUnique.mockImplementation(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id === MOCK_DANISAN_ID ? mockDanisanUser() : null),
    );
    prismaMock.refreshToken.create.mockResolvedValue(
      storedTokenRow('new-refresh-token'),
    );
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('geçerli (hiç kullanılmamış) token ile yeni çift döner ve token soft-revoke edilir', async () => {
    const token = signRefreshJwt();
    prismaMock.refreshToken.findUnique.mockResolvedValue(storedTokenRow(token));
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: token })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.id).toBe(MOCK_DANISAN_ID);

    // Atomik claim: yalnızca revokedAt=null satır damgalanır
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      }),
    );
    // Hard-delete artık yapılmaz
    expect(prismaMock.refreshToken.delete).not.toHaveBeenCalled();
  });

  it('az önce revoke edilmiş token, hoşgörü penceresi İÇİNDE tekrar kabul edilir (çift F5 / çok sekme)', async () => {
    const token = signRefreshJwt();
    const revokedAt = new Date(Date.now() - 10_000); // 10 sn önce rotasyonlanmış
    prismaMock.refreshToken.findUnique.mockResolvedValue(
      storedTokenRow(token, { revokedAt }),
    );
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 }); // zaten revoke'lu

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: token })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('penceresi kapanmış (eski) revoke token 401 alır', async () => {
    const token = signRefreshJwt();
    const revokedAt = new Date(Date.now() - REFRESH_GRACE_MS - 60_000); // pencere + 1 dk önce
    prismaMock.refreshToken.findUnique.mockResolvedValue(
      storedTokenRow(token, { revokedAt }),
    );
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: token })
      .expect(401);
  });

  it('DB kaydı olmayan (logout edilmiş / bilinmeyen) token 401 alır', async () => {
    const token = signRefreshJwt();
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: token })
      .expect(401);
  });

  it('süresi dolmuş (expiresAt geçmiş) token 401 alır', async () => {
    const token = signRefreshJwt();
    prismaMock.refreshToken.findUnique.mockResolvedValue(
      storedTokenRow(token, { expiresAt: new Date(Date.now() - 1000) }),
    );

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: token })
      .expect(401);
  });
});
