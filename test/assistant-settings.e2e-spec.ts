import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';

import { AssistantModule } from '../src/assistant/assistant.module';
import { AssistantService } from '../src/assistant/assistant.service';
import { KnowledgeService } from '../src/assistant/knowledge.service';
import { OpenAiClient } from '../src/assistant/openai.client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageModule } from '../src/storage/storage.module';
import { StorageService } from '../src/storage/storage.service';
import { MailService } from '../src/mail/mail.service';
import { MetaSenderService } from '../src/webhooks/meta-sender.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import {
  buildPrismaMock,
  MOCK_ADMIN_ID,
  mockAdminUser,
  mockUzmanUser,
  mockDanisanUser,
  MOCK_DANISAN_ID,
  MOCK_UZMAN_ID,
} from './helpers/prisma-mock';
import {
  adminToken,
  danisanToken,
  uzmanToken,
  bearerHeader,
  TEST_JWT_SECRET,
} from './helpers/auth.helper';
import { buildMailMock } from './helpers/create-test-app';

process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';
process.env.ASSISTANT_ENABLED = 'true';

const SETTINGS_PATH = '/admin/assistant/settings';

describe('Assistant settings (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  const mailMock = buildMailMock();
  const metaSenderMock = {
    sendText: jest.fn().mockResolvedValue({ ok: true }),
  };
  const knowledgeMock = {
    createEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    recordUnanswered: jest.fn(),
  };
  const openAiMock = {
    chat: jest.fn(),
    embed: jest.fn(),
  };
  const assistantMock = {
    handleIncoming: jest.fn().mockResolvedValue(undefined),
    handleCrisis: jest.fn().mockResolvedValue(undefined),
  };

  const restoreUsers = () => {
    prismaMock.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }) => {
        if (where.id === MOCK_ADMIN_ID) return Promise.resolve(mockAdminUser());
        if (where.id === MOCK_UZMAN_ID) return Promise.resolve(mockUzmanUser());
        if (where.id === MOCK_DANISAN_ID)
          return Promise.resolve(mockDanisanUser());
        return Promise.resolve(null);
      },
    );
  };

  beforeAll(async () => {
    prismaMock = buildPrismaMock();
    restoreUsers();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        StorageModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({}),
        AssistantModule,
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(MailService)
      .useValue(mailMock)
      .overrideProvider(StorageService)
      .useValue({
        upload: jest.fn().mockResolvedValue('http://localhost:9000/x.png'),
        deleteByUrl: jest.fn().mockResolvedValue(undefined),
        onModuleInit: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(MetaSenderService)
      .useValue(metaSenderMock)
      .overrideProvider(KnowledgeService)
      .useValue(knowledgeMock)
      .overrideProvider(OpenAiClient)
      .useValue(openAiMock)
      .overrideProvider(AssistantService)
      .useValue(assistantMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    restoreUsers();
    prismaMock.systemSetting.findFirst.mockResolvedValue({
      id: 'settings-1',
      assistantMode: 'SHADOW',
      assistantNoticeText: null,
    });
    prismaMock.systemSetting.update.mockResolvedValue({ id: 'settings-1' });
  });

  describe('GET /admin/assistant/settings', () => {
    it('ADMIN icin 200 ve mod alanlarini doner', async () => {
      const res = await request(app.getHttpServer())
        .get(SETTINGS_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toMatchObject({
        mode: 'SHADOW',
        envEnabled: true,
        effectiveMode: 'SHADOW',
        noticeText: null,
      });
    });

    it('UZMAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .get(SETTINGS_PATH)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });

    it('DANISAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .get(SETTINGS_PATH)
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(403);
    });

    it('token yoksa 401 doner', async () => {
      await request(app.getHttpServer()).get(SETTINGS_PATH).expect(401);
    });
  });

  describe('PATCH /admin/assistant/settings', () => {
    it('UZMAN icin 403 doner ve ayar yazilmaz', async () => {
      await request(app.getHttpServer())
        .patch(SETTINGS_PATH)
        .set('Authorization', bearerHeader(uzmanToken()))
        .send({ mode: 'LIVE' })
        .expect(403);

      expect(prismaMock.systemSetting.update).not.toHaveBeenCalled();
    });

    it('token yoksa 401 doner', async () => {
      await request(app.getHttpServer())
        .patch(SETTINGS_PATH)
        .send({ mode: 'LIVE' })
        .expect(401);
    });

    it('gecersiz mode icin 400 doner', async () => {
      await request(app.getHttpServer())
        .patch(SETTINGS_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ mode: 'GECERSIZ' })
        .expect(400);

      expect(prismaMock.systemSetting.update).not.toHaveBeenCalled();
    });

    it('ADMIN gecerli mode ile 200 doner ve kaydeder', async () => {
      prismaMock.systemSetting.findFirst.mockResolvedValueOnce({
        id: 'settings-1',
      });
      prismaMock.systemSetting.findFirst.mockResolvedValueOnce({
        assistantMode: 'LIVE',
        assistantNoticeText: null,
      });

      const res = await request(app.getHttpServer())
        .patch(SETTINGS_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ mode: 'LIVE' })
        .expect(200);

      expect(prismaMock.systemSetting.update).toHaveBeenCalledWith({
        where: { id: 'settings-1' },
        data: { assistantMode: 'LIVE' },
      });
      expect(res.body).toMatchObject({ mode: 'LIVE' });
    });
  });
});
