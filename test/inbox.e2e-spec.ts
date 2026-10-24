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

const CONVERSATION_UUID = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';
const LEAD_UUID = 'a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7';
const QUESTION_UUID = 'b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8';

describe('Inbox (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  const mailMock = buildMailMock();
  const metaSenderMock = {
    sendText: jest.fn().mockResolvedValue(true),
  };
  const knowledgeMock = {
    createEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    recordUnanswered: jest.fn(),
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
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
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

  describe('GET /admin/inbox/conversations', () => {
    it('ADMIN icin 200 doner', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      const res = await request(app.getHttpServer())
        .get('/admin/inbox/conversations')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0 });
    });

    it('UZMAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .get('/admin/inbox/conversations')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });

    it('DANISAN icin 403 doner', async () => {
      await request(app.getHttpServer())
        .get('/admin/inbox/conversations')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(403);
    });

    it('token yoksa 401 doner', async () => {
      await request(app.getHttpServer())
        .get('/admin/inbox/conversations')
        .expect(401);
    });
  });

  describe('GET /admin/inbox/counts', () => {
    it('ADMIN icin 200 ve sayac alanlarini doner', async () => {
      prismaMock.$transaction.mockResolvedValue([0, 0, 0, 0, 0]);

      const res = await request(app.getHttpServer())
        .get('/admin/inbox/counts')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toMatchObject({
        open: 0,
        pendingAgent: 0,
        crisis: 0,
        newLeads: 0,
        openUnanswered: 0,
      });
    });
  });

  describe('PATCH /admin/leads/:id/status', () => {
    it('gecersiz status icin 400 doner', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/leads/${LEAD_UUID}/status`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ status: 'GECERSIZ_DURUM' })
        .expect(400);
    });
  });

  describe('POST /admin/knowledge', () => {
    it('piiConfirmed alani yoksa 400 doner', async () => {
      await request(app.getHttpServer())
        .post('/admin/knowledge')
        .set('Authorization', bearerHeader(adminToken()))
        .send({
          category: 'HIZMET',
          title: 'Baslik',
          content: 'Icerik',
        })
        .expect(400);
    });
  });

  describe('POST /admin/appointments', () => {
    it('gecersiz body icin 400 doner', async () => {
      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', bearerHeader(adminToken()))
        .send({ contactId: 'gecersiz' })
        .expect(400);
    });
  });

  describe('POST /admin/inbox/conversations/:id/messages', () => {
    it('bos content icin 400 doner', async () => {
      await request(app.getHttpServer())
        .post(`/admin/inbox/conversations/${CONVERSATION_UUID}/messages`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ content: '' })
        .expect(400);
    });
  });

  describe('POST /admin/unanswered/:id/resolve', () => {
    it('addToKnowledge true ve piiConfirmed yoksa 400 doner', async () => {
      prismaMock.unansweredQuestion.findUnique.mockResolvedValue({
        id: QUESTION_UUID,
      });

      await request(app.getHttpServer())
        .post(`/admin/unanswered/${QUESTION_UUID}/resolve`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ addToKnowledge: true, category: 'HIZMET', title: 'B', content: 'C' })
        .expect(400);
    });
  });
});
