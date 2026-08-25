/**
 * Kimlik doğrulama gerektiren test modülleri için ortak app factory.
 * JwtAuthGuard + RolesGuard global olarak eklenir.
 * PrismaService ve MailService mock'lanır.
 *
 * Strateji:
 *   - PrismaModule @Global() olduğu için root TestingModule'a import edilir.
 *   - overrideProvider(PrismaService) ile tüm modüllerdeki PrismaService mock ile değiştirilir.
 *   - Bu yaklaşım hem PrismaModule import eden hem etmeyen feature modülleri için çalışır.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Type,
  Provider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { StorageModule } from '../../src/storage/storage.module';
import { StorageService } from '../../src/storage/storage.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/mail/mail.service';
import { TEST_JWT_SECRET } from './auth.helper';
import {
  buildPrismaMock,
  MOCK_DANISAN_ID,
  MOCK_UZMAN_ID,
  MOCK_ADMIN_ID,
  mockDanisanUser,
  mockUzmanUser,
  mockAdminUser,
} from './prisma-mock';

export interface TestAppContext {
  app: INestApplication;
  prismaMock: ReturnType<typeof buildPrismaMock>;
}

/**
 * Kimlik doğrulama altyapısı dahil test uygulaması oluşturur.
 *
 * @param featureModules - test edilecek feature module(lar)
 * @param extraProviders  - ek provider'lar (opsiyonel)
 */
/**
 * Bir servisin TUM public metodlarini prototipten okuyup jest.fn() ile mock'lar.
 * Servise yeni metot eklendiginde mock'un geride kalmasini (ve testlerin
 * "is not a function" ile patlamasini) engeller.
 */
function autoMock<T>(
  ctor: Type<T>,
  overrides: Record<string, jest.Mock> = {},
): Record<string, jest.Mock> {
  const mock: Record<string, jest.Mock> = {};
  for (const key of Object.getOwnPropertyNames(ctor.prototype)) {
    if (key === 'constructor') continue;
    mock[key] = jest.fn().mockResolvedValue(undefined);
  }
  return { ...mock, ...overrides };
}

export const buildMailMock = () => autoMock(MailService);

const buildStorageMock = () =>
  autoMock(StorageService, {
    upload: jest
      .fn()
      .mockResolvedValue('http://localhost:9000/psiko-uploads/test-file.png'),
  });

export async function createAuthTestApp(
  featureModules: Type<unknown>[],
  extraProviders: Provider[] = [],
): Promise<TestAppContext> {
  // ENV ayarları — JwtStrategy constructor'ında okunur
  process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES = '15m';
  process.env.JWT_REFRESH_EXPIRES = '7d';

  const prismaMock = buildPrismaMock();

  // JwtStrategy.validate → user.findUnique ile mock user döndür
  prismaMock.user.findUnique.mockImplementation(
    ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === MOCK_DANISAN_ID)
        return Promise.resolve(mockDanisanUser());
      if (where.id === MOCK_UZMAN_ID) return Promise.resolve(mockUzmanUser());
      if (where.id === MOCK_ADMIN_ID) return Promise.resolve(mockAdminUser());
      return Promise.resolve(null);
    },
  );

  const mailMock = buildMailMock();
  const storageMock = buildStorageMock();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule, // @Global() — PrismaService'i tüm modüllere sağlar; overrideProvider ile mock'lanır
      StorageModule, // @Global() — StorageService (MinIO) aynı şekilde mock'lanır
      PassportModule.register({ defaultStrategy: 'jwt' }),
      JwtModule.register({}),
      ...featureModules,
    ],
    providers: [
      JwtStrategy,
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      ...extraProviders,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(MailService)
    .useValue(mailMock)
    .overrideProvider(StorageService)
    .useValue(storageMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  return { app, prismaMock };
}

/**
 * Public endpoint'ler için basit test uygulaması (guard yok).
 */
export async function createPublicTestApp(
  featureModules: Type<unknown>[],
  extraProviders: Provider[] = [],
): Promise<TestAppContext> {
  const prismaMock = buildPrismaMock();

  const mailMock = buildMailMock();
  const storageMock = buildStorageMock();

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PrismaModule, // @Global() — PrismaService'i tüm modüllere sağlar; overrideProvider ile mock'lanır
      StorageModule, // @Global() — StorageService (MinIO) aynı şekilde mock'lanır
      ...featureModules,
    ],
    providers: [...extraProviders],
  })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .overrideProvider(MailService)
    .useValue(mailMock)
    .overrideProvider(StorageService)
    .useValue(storageMock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  return { app, prismaMock };
}
