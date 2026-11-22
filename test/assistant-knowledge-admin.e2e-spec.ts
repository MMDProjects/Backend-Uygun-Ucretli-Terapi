import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';

import { InboxModule } from '../src/inbox/inbox.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { StorageModule } from '../src/storage/storage.module';
import { StorageService } from '../src/storage/storage.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { MetaSenderService } from '../src/webhooks/meta-sender.service';
import { KnowledgeService } from '../src/assistant/knowledge.service';
import { AssistantService } from '../src/assistant/assistant.service';
import { OpenAiUnavailableError } from '../src/assistant/openai.client';
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

const SEARCH_PATH = '/admin/knowledge/search';
const REINDEX_PATH = '/admin/knowledge/reindex-missing';
const STATS_PATH = '/admin/knowledge/stats';
const PREVIEW_PATH = '/admin/assistant/preview';
const UNANSWERED_PATH = '/admin/unanswered';

describe('Assistant knowledge admin (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  const mailMock = buildMailMock();
  const metaSenderMock = {
    sendText: jest.fn().mockResolvedValue({ ok: true }),
  };
  const knowledgeMock = {
    search: jest.fn(),
    reindexMissing: jest.fn(),
    createEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    recordUnanswered: jest.fn(),
  };
  const assistantMock = {
    previewReply: jest.fn(),
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
        InboxModule,
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
  });

  describe('POST /admin/knowledge/search', () => {
    it('ADMIN icin 200 ve sonuc doner', async () => {
      knowledgeMock.search.mockResolvedValue({
        items: [
          {
            id: 'k-1',
            title: 'Randevu',
            source: 'MANUAL',
            score: 0.91,
            content: 'Randevu nasil alinir.',
          },
        ],
        topScore: 0.91,
        threshold: 0.5,
      });

      const res = await request(app.getHttpServer())
        .post(SEARCH_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ query: 'randevu' })
        .expect(201);

      expect(knowledgeMock.search).toHaveBeenCalledWith('randevu');
      expect(res.body).toMatchObject({
        query: 'randevu',
        threshold: 0.5,
        topScore: 0.91,
        items: [{ id: 'k-1', title: 'Randevu', score: 0.91 }],
      });
    });

    it('UZMAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .post(SEARCH_PATH)
        .set('Authorization', bearerHeader(uzmanToken()))
        .send({ query: 'randevu' })
        .expect(403);

      expect(knowledgeMock.search).not.toHaveBeenCalled();
    });

    it('DANISAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .post(SEARCH_PATH)
        .set('Authorization', bearerHeader(danisanToken()))
        .send({ query: 'randevu' })
        .expect(403);
    });

    it('bos query icin 400 doner', async () => {
      await request(app.getHttpServer())
        .post(SEARCH_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ query: '' })
        .expect(400);

      expect(knowledgeMock.search).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/knowledge/reindex-missing', () => {
    it('ADMIN icin 201 ve islem sonucunu doner', async () => {
      knowledgeMock.reindexMissing.mockResolvedValue({
        processed: 3,
        failed: 0,
        remaining: 0,
      });

      const res = await request(app.getHttpServer())
        .post(REINDEX_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .expect(201);

      expect(res.body).toEqual({ processed: 3, failed: 0, remaining: 0 });
    });

    it('OpenAI anahtari yoksa 503 doner', async () => {
      knowledgeMock.reindexMissing.mockRejectedValue(
        new OpenAiUnavailableError(),
      );

      await request(app.getHttpServer())
        .post(REINDEX_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .expect(503);
    });

    it('UZMAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .post(REINDEX_PATH)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);

      expect(knowledgeMock.reindexMissing).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/knowledge/stats', () => {
    it('ADMIN icin 200 ve sayilari doner', async () => {
      prismaMock.$transaction.mockResolvedValue([10, 2]);

      const res = await request(app.getHttpServer())
        .get(STATS_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toEqual({ total: 10, missingEmbedding: 2 });
    });
  });

  describe('POST /admin/assistant/preview', () => {
    it('ADMIN icin 201 ve onizlemeyi doner', async () => {
      assistantMock.previewReply.mockResolvedValue({
        reply: 'Merhaba, size nasil yardimci olabilirim?',
      });

      const res = await request(app.getHttpServer())
        .post(PREVIEW_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ message: 'Merhaba' })
        .expect(201);

      expect(assistantMock.previewReply).toHaveBeenCalledWith('Merhaba');
      expect(res.body).toEqual({
        reply: 'Merhaba, size nasil yardimci olabilirim?',
      });
    });

    it('message eksikse 400 doner', async () => {
      await request(app.getHttpServer())
        .post(PREVIEW_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .send({})
        .expect(400);

      expect(assistantMock.previewReply).not.toHaveBeenCalled();
    });

    it('OpenAI kullanilamazsa 503 doner', async () => {
      assistantMock.previewReply.mockRejectedValue(
        new OpenAiUnavailableError(),
      );

      await request(app.getHttpServer())
        .post(PREVIEW_PATH)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ message: 'Merhaba' })
        .expect(503);
    });

    it('UZMAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .post(PREVIEW_PATH)
        .set('Authorization', bearerHeader(uzmanToken()))
        .send({ message: 'Merhaba' })
        .expect(403);
    });
  });

  describe('GET /admin/unanswered', () => {
    it('status=DISMISSED icin 200 doner', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      const res = await request(app.getHttpServer())
        .get(UNANSWERED_PATH)
        .query({ status: 'DISMISSED' })
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0 });
      expect(prismaMock.unansweredQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'DISMISSED' },
        }),
      );
    });

    it('gecersiz status icin 400 doner', async () => {
      await request(app.getHttpServer())
        .get(UNANSWERED_PATH)
        .query({ status: 'XYZ' })
        .set('Authorization', bearerHeader(adminToken()))
        .expect(400);
    });

    it('sort=count icin 200 doner ve askCount ile siralar', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await request(app.getHttpServer())
        .get(UNANSWERED_PATH)
        .query({ sort: 'count' })
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.unansweredQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ askCount: 'desc' }, { lastAskedAt: 'desc' }],
        }),
      );
    });

    it('UZMAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .get(UNANSWERED_PATH)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });
  });
});
