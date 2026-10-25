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
  MOCK_EXPERT_PROFILE_ID,
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
const CONTACT_UUID = 'c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9';
const TAG_UUID = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
const CANNED_UUID = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const PROMPT_UUID = 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3';
const APPOINTMENT_UUID = 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4';

// Fiyat tablosu yer tutucusu içeren geçerli uzunlukta bir prompt.
const VALID_PROMPT = `${'Elif yönergesi. '.repeat(40)}{{FIYAT_TABLOSU}}`;

describe('Operatör özellikleri (e2e)', () => {
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
  const assistantMock = {
    previewReply: jest.fn().mockResolvedValue({ reply: 'Merhaba' }),
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

  const admin = () => bearerHeader(adminToken());
  const uzman = () => bearerHeader(uzmanToken());
  const danisan = () => bearerHeader(danisanToken());

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

  // Rol kontrolü gövdeden önce çalışır; UZMAN ve DANISAN her uç noktada 403 almalı.
  describe('rol kontrolü (UZMAN ve DANISAN 403)', () => {
    const routes: Array<{
      method: 'get' | 'post' | 'patch' | 'delete';
      path: string;
      body?: object;
    }> = [
      {
        method: 'post',
        path: `/admin/inbox/conversations/${CONVERSATION_UUID}/assign`,
        body: { userId: null },
      },
      {
        method: 'post',
        path: `/admin/inbox/conversations/${CONVERSATION_UUID}/read`,
      },
      { method: 'get', path: '/admin/inbox/search?q=merhaba' },
      { method: 'get', path: '/admin/inbox/tags' },
      { method: 'post', path: '/admin/inbox/tags', body: { name: 'VIP' } },
      {
        method: 'patch',
        path: `/admin/inbox/tags/${TAG_UUID}`,
        body: { name: 'VIP' },
      },
      { method: 'delete', path: `/admin/inbox/tags/${TAG_UUID}` },
      { method: 'get', path: '/admin/inbox/canned-responses' },
      {
        method: 'post',
        path: '/admin/inbox/canned-responses',
        body: { title: 'Selam', content: 'Merhaba' },
      },
      {
        method: 'patch',
        path: `/admin/inbox/canned-responses/${CANNED_UUID}`,
        body: { title: 'Selam' },
      },
      {
        method: 'delete',
        path: `/admin/inbox/canned-responses/${CANNED_UUID}`,
      },
      { method: 'get', path: '/admin/assistant/prompts' },
      {
        method: 'post',
        path: '/admin/assistant/prompts',
        body: { content: VALID_PROMPT },
      },
      {
        method: 'post',
        path: '/admin/assistant/prompts/test',
        body: { content: VALID_PROMPT, message: 'Merhaba' },
      },
      { method: 'get', path: '/admin/assistant/analytics' },
      {
        method: 'patch',
        path: `/admin/appointments/${APPOINTMENT_UUID}/status`,
        body: { status: 'CANCELLED' },
      },
      {
        method: 'patch',
        path: `/admin/inbox/contacts/${CONTACT_UUID}`,
        body: { tagIds: [TAG_UUID] },
      },
      {
        method: 'delete',
        path: `/admin/inbox/contacts/${CONTACT_UUID}/summary`,
      },
    ];

    it.each(routes)('$method $path icin UZMAN 403 doner', async (route) => {
      await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', uzman())
        .send(route.body ?? {})
        .expect(403);
    });

    it.each(routes)('$method $path icin DANISAN 403 doner', async (route) => {
      await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', danisan())
        .send(route.body ?? {})
        .expect(403);
    });
  });

  describe('POST /admin/inbox/conversations/:id/assign', () => {
    it('ADMIN icin atamayı kaldırır ve 201 doner', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_UUID,
        assignedUserId: null,
      });
      prismaMock.conversation.update.mockResolvedValue({
        id: CONVERSATION_UUID,
        assignedUserId: null,
      });

      await request(app.getHttpServer())
        .post(`/admin/inbox/conversations/${CONVERSATION_UUID}/assign`)
        .set('Authorization', admin())
        .send({ userId: null })
        .expect(201);

      expect(prismaMock.conversation.update).toHaveBeenCalledWith({
        where: { id: CONVERSATION_UUID },
        data: { assignedUserId: null, assignedAt: null },
      });
    });

    it('ADMIN olmayan kullaniciya atama 400 doner', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_UUID,
      });

      await request(app.getHttpServer())
        .post(`/admin/inbox/conversations/${CONVERSATION_UUID}/assign`)
        .set('Authorization', admin())
        .send({ userId: MOCK_UZMAN_ID })
        .expect(400);

      expect(prismaMock.conversation.update).not.toHaveBeenCalled();
    });

    it('gecersiz userId (uuid degil) icin 400 doner', async () => {
      await request(app.getHttpServer())
        .post(`/admin/inbox/conversations/${CONVERSATION_UUID}/assign`)
        .set('Authorization', admin())
        .send({ userId: 'gecersiz' })
        .expect(400);

      expect(prismaMock.conversation.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/inbox/conversations/:id/read', () => {
    it('ADMIN icin okundu isaretler ve 201 doner', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        id: CONVERSATION_UUID,
      });
      prismaMock.conversationRead.upsert.mockResolvedValue({
        userId: MOCK_ADMIN_ID,
        conversationId: CONVERSATION_UUID,
      });

      await request(app.getHttpServer())
        .post(`/admin/inbox/conversations/${CONVERSATION_UUID}/read`)
        .set('Authorization', admin())
        .expect(201);

      expect(prismaMock.conversationRead.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_conversationId: {
              userId: MOCK_ADMIN_ID,
              conversationId: CONVERSATION_UUID,
            },
          },
        }),
      );
    });

    it('var olmayan konusma icin 404 doner', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/admin/inbox/conversations/${CONVERSATION_UUID}/read`)
        .set('Authorization', admin())
        .expect(404);
    });
  });

  describe('GET /admin/inbox/search', () => {
    it('ADMIN icin 200 ve sonuc listesi doner', async () => {
      prismaMock.message.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/admin/inbox/search?q=merhaba')
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('q iki karakterden kisa ise 400 doner', async () => {
      await request(app.getHttpServer())
        .get('/admin/inbox/search?q=a')
        .set('Authorization', admin())
        .expect(400);

      expect(prismaMock.message.findMany).not.toHaveBeenCalled();
    });
  });

  describe('etiketler (/admin/inbox/tags)', () => {
    it('GET ADMIN icin etiketleri contactCount ile doner', async () => {
      prismaMock.contactTag.findMany.mockResolvedValue([
        {
          id: TAG_UUID,
          name: 'VIP',
          color: 'gray',
          _count: { contacts: 2 },
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/admin/inbox/tags')
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toEqual([
        expect.objectContaining({ name: 'VIP', contactCount: 2 }),
      ]);
    });

    it('POST ADMIN icin etiket olusturur ve 201 doner', async () => {
      prismaMock.contactTag.findFirst.mockResolvedValue(null);
      prismaMock.contactTag.create.mockResolvedValue({
        id: TAG_UUID,
        name: 'VIP',
        color: 'gray',
      });

      await request(app.getHttpServer())
        .post('/admin/inbox/tags')
        .set('Authorization', admin())
        .send({ name: '  VIP  ' })
        .expect(201);

      expect(prismaMock.contactTag.create).toHaveBeenCalledWith({
        data: { name: 'VIP', color: 'gray' },
      });
    });

    it('POST gecersiz renk icin 400 doner', async () => {
      await request(app.getHttpServer())
        .post('/admin/inbox/tags')
        .set('Authorization', admin())
        .send({ name: 'VIP', color: 'pembe' })
        .expect(400);

      expect(prismaMock.contactTag.create).not.toHaveBeenCalled();
    });

    it('POST ad cakisirsa 409 doner', async () => {
      prismaMock.contactTag.findFirst.mockResolvedValue({ id: TAG_UUID });

      await request(app.getHttpServer())
        .post('/admin/inbox/tags')
        .set('Authorization', admin())
        .send({ name: 'vip' })
        .expect(409);

      expect(prismaMock.contactTag.create).not.toHaveBeenCalled();
    });

    it('PATCH ADMIN icin etiketi gunceller ve 200 doner', async () => {
      prismaMock.contactTag.findUnique.mockResolvedValue({ id: TAG_UUID });
      prismaMock.contactTag.findFirst.mockResolvedValue(null);
      prismaMock.contactTag.update.mockResolvedValue({
        id: TAG_UUID,
        name: 'Premium',
        color: 'amber',
      });

      await request(app.getHttpServer())
        .patch(`/admin/inbox/tags/${TAG_UUID}`)
        .set('Authorization', admin())
        .send({ name: 'Premium', color: 'amber' })
        .expect(200);

      expect(prismaMock.contactTag.update).toHaveBeenCalledWith({
        where: { id: TAG_UUID },
        data: { name: 'Premium', color: 'amber' },
      });
    });

    it('PATCH gecersiz renk icin 400 doner', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/inbox/tags/${TAG_UUID}`)
        .set('Authorization', admin())
        .send({ color: 'pembe' })
        .expect(400);
    });

    it('DELETE ADMIN icin { ok: true } doner', async () => {
      prismaMock.contactTag.findUnique.mockResolvedValue({ id: TAG_UUID });
      prismaMock.contactTag.delete.mockResolvedValue({ id: TAG_UUID });

      const res = await request(app.getHttpServer())
        .delete(`/admin/inbox/tags/${TAG_UUID}`)
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toEqual({ ok: true });
    });

    it('DELETE olmayan etiket icin 404 doner', async () => {
      prismaMock.contactTag.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete(`/admin/inbox/tags/${TAG_UUID}`)
        .set('Authorization', admin())
        .expect(404);
    });
  });

  describe('hazır cevaplar (/admin/inbox/canned-responses)', () => {
    it('GET ADMIN icin 200 doner', async () => {
      prismaMock.cannedResponse.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/admin/inbox/canned-responses?q=selam')
        .set('Authorization', admin())
        .expect(200);
    });

    it('POST ADMIN icin olusturur ve 201 doner', async () => {
      prismaMock.cannedResponse.create.mockResolvedValue({
        id: CANNED_UUID,
        title: 'Selam',
        content: 'Merhaba',
        shortcut: null,
      });

      await request(app.getHttpServer())
        .post('/admin/inbox/canned-responses')
        .set('Authorization', admin())
        .send({ title: 'Selam', content: 'Merhaba' })
        .expect(201);
    });

    it('POST gecersiz kisayol icin 400 doner', async () => {
      await request(app.getHttpServer())
        .post('/admin/inbox/canned-responses')
        .set('Authorization', admin())
        .send({ title: 'Selam', content: 'Merhaba', shortcut: 'Buyuk Harf' })
        .expect(400);

      expect(prismaMock.cannedResponse.create).not.toHaveBeenCalled();
    });

    it('PATCH ADMIN icin gunceller ve 200 doner', async () => {
      prismaMock.cannedResponse.findUnique.mockResolvedValue({
        id: CANNED_UUID,
      });
      prismaMock.cannedResponse.update.mockResolvedValue({
        id: CANNED_UUID,
        title: 'Selam 2',
      });

      await request(app.getHttpServer())
        .patch(`/admin/inbox/canned-responses/${CANNED_UUID}`)
        .set('Authorization', admin())
        .send({ title: 'Selam 2' })
        .expect(200);
    });

    it('DELETE ADMIN icin { ok: true } doner', async () => {
      prismaMock.cannedResponse.findUnique.mockResolvedValue({
        id: CANNED_UUID,
      });
      prismaMock.cannedResponse.delete.mockResolvedValue({ id: CANNED_UUID });

      const res = await request(app.getHttpServer())
        .delete(`/admin/inbox/canned-responses/${CANNED_UUID}`)
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('prompt sürümleri (/admin/assistant/prompts)', () => {
    it('GET ADMIN icin sürüm listesini doner', async () => {
      prismaMock.assistantPrompt.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/admin/assistant/prompts')
        .set('Authorization', admin())
        .expect(200);
    });

    it('POST yer tutucu yoksa 400 doner', async () => {
      await request(app.getHttpServer())
        .post('/admin/assistant/prompts')
        .set('Authorization', admin())
        .send({ content: 'x'.repeat(600) })
        .expect(400);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('POST /test yer tutucu yoksa 400 doner ve OpenAI cagrilmaz', async () => {
      await request(app.getHttpServer())
        .post('/admin/assistant/prompts/test')
        .set('Authorization', admin())
        .send({ content: 'x'.repeat(600), message: 'Merhaba' })
        .expect(400);

      expect(assistantMock.previewReply).not.toHaveBeenCalled();
    });

    it('POST /test ADMIN icin onizleme doner', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/assistant/prompts/test')
        .set('Authorization', admin())
        .send({ content: VALID_PROMPT, message: 'Merhaba' })
        .expect(201);

      expect(res.body).toEqual({ reply: 'Merhaba' });
      expect(assistantMock.previewReply).toHaveBeenCalledWith(
        'Merhaba',
        expect.objectContaining({ promptOverride: VALID_PROMPT }),
      );
    });

    it('POST /:id/activate var olmayan sürüm icin 404 doner', async () => {
      prismaMock.assistantPrompt.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/admin/assistant/prompts/${PROMPT_UUID}/activate`)
        .set('Authorization', admin())
        .expect(404);
    });
  });

  describe('GET /admin/assistant/analytics', () => {
    it('aralik 180 gunden uzunsa 400 doner', async () => {
      await request(app.getHttpServer())
        .get('/admin/assistant/analytics?from=2026-01-01&to=2026-10-25')
        .set('Authorization', admin())
        .expect(400);

      expect(prismaMock.conversation.findMany).not.toHaveBeenCalled();
    });

    it('ADMIN icin kisa aralikta 200 doner', async () => {
      prismaMock.conversation.findMany.mockResolvedValue([]);
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.appointment.count.mockResolvedValue(0);
      prismaMock.unansweredQuestion.count.mockResolvedValue(0);
      prismaMock.unansweredQuestion.findMany.mockResolvedValue([]);
      prismaMock.message.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/admin/assistant/analytics?from=2026-10-01&to=2026-10-25')
        .set('Authorization', admin())
        .expect(200);
    });
  });

  describe('PATCH /admin/appointments/:id/status', () => {
    it('gecersiz durum degeri icin 400 doner', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/appointments/${APPOINTMENT_UUID}/status`)
        .set('Authorization', admin())
        .send({ status: 'XYZ' })
        .expect(400);
    });

    it('SCHEDULED randevuyu gecmis saatte COMPLETED yapar ve 200 doner', async () => {
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'SCHEDULED',
        scheduledAt: new Date('2025-01-01T10:00:00Z'),
      });
      prismaMock.appointment.update.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'COMPLETED',
      });

      await request(app.getHttpServer())
        .patch(`/admin/appointments/${APPOINTMENT_UUID}/status`)
        .set('Authorization', admin())
        .send({ status: 'COMPLETED' })
        .expect(200);
    });

    it('iptal edilmis randevunun durumu degistirilemezse 400 doner', async () => {
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'CANCELLED',
        scheduledAt: new Date('2025-01-01T10:00:00Z'),
      });

      await request(app.getHttpServer())
        .patch(`/admin/appointments/${APPOINTMENT_UUID}/status`)
        .set('Authorization', admin())
        .send({ status: 'COMPLETED' })
        .expect(400);

      expect(prismaMock.appointment.update).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/inbox/contacts/:id (tagIds)', () => {
    it('tagIds uuid degilse 400 doner', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/inbox/contacts/${CONTACT_UUID}`)
        .set('Authorization', admin())
        .send({ tagIds: ['gecersiz'] })
        .expect(400);

      expect(prismaMock.contact.update).not.toHaveBeenCalled();
    });

    it('gecerli tagIds ile etiketleri degistirir ve 200 doner', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        id: CONTACT_UUID,
        channel: 'INSTAGRAM',
        phone: null,
      });
      prismaMock.contactTag.count.mockResolvedValue(1);
      prismaMock.contact.update.mockResolvedValue({ id: CONTACT_UUID });

      await request(app.getHttpServer())
        .patch(`/admin/inbox/contacts/${CONTACT_UUID}`)
        .set('Authorization', admin())
        .send({ tagIds: [TAG_UUID] })
        .expect(200);

      expect(prismaMock.contact.update).toHaveBeenCalledWith({
        where: { id: CONTACT_UUID },
        data: { tags: { set: [{ id: TAG_UUID }] } },
      });
    });
  });

  describe('DELETE /admin/inbox/contacts/:id/summary', () => {
    it('ADMIN icin ozeti temizler ve 200 doner', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({ id: CONTACT_UUID });
      prismaMock.contact.update.mockResolvedValue({
        id: CONTACT_UUID,
        lastSummary: null,
        lastSummaryAt: null,
      });

      await request(app.getHttpServer())
        .delete(`/admin/inbox/contacts/${CONTACT_UUID}/summary`)
        .set('Authorization', admin())
        .expect(200);

      expect(prismaMock.contact.update).toHaveBeenCalledWith({
        where: { id: CONTACT_UUID },
        data: { lastSummary: null, lastSummaryAt: null },
        select: { id: true, lastSummary: true, lastSummaryAt: true },
      });
    });

    it('var olmayan kisi icin 404 doner', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete(`/admin/inbox/contacts/${CONTACT_UUID}/summary`)
        .set('Authorization', admin())
        .expect(404);
    });
  });

  // Güncellemede null gönderilen alanlar 500 yerine 400 ile reddedilir.
  describe('PATCH null değer doğrulaması (400)', () => {
    it('etiket adı null ise 400 doner ve servise gidilmez', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/inbox/tags/${TAG_UUID}`)
        .set('Authorization', admin())
        .send({ name: null })
        .expect(400);

      expect(prismaMock.contactTag.update).not.toHaveBeenCalled();
    });

    it('etiket rengi null ise 400 doner', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/inbox/tags/${TAG_UUID}`)
        .set('Authorization', admin())
        .send({ color: null })
        .expect(400);

      expect(prismaMock.contactTag.update).not.toHaveBeenCalled();
    });

    it('hazır cevap başlığı ve içeriği null ise 400 doner', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/inbox/canned-responses/${CANNED_UUID}`)
        .set('Authorization', admin())
        .send({ title: null })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/admin/inbox/canned-responses/${CANNED_UUID}`)
        .set('Authorization', admin())
        .send({ content: null })
        .expect(400);

      expect(prismaMock.cannedResponse.update).not.toHaveBeenCalled();
    });

    it('hazır cevap kısayolu null ise kısayol kaldırılır (200)', async () => {
      prismaMock.cannedResponse.findUnique.mockResolvedValue({
        id: CANNED_UUID,
      });
      prismaMock.cannedResponse.update.mockResolvedValue({
        id: CANNED_UUID,
        shortcut: null,
      });

      await request(app.getHttpServer())
        .patch(`/admin/inbox/canned-responses/${CANNED_UUID}`)
        .set('Authorization', admin())
        .send({ shortcut: null })
        .expect(200);

      expect(prismaMock.cannedResponse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ shortcut: null }),
        }),
      );
    });

    it('kişi durumu ve tipi null ise 400 doner', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/inbox/contacts/${CONTACT_UUID}`)
        .set('Authorization', admin())
        .send({ lifecycleStatus: null })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/admin/inbox/contacts/${CONTACT_UUID}`)
        .set('Authorization', admin())
        .send({ contactType: null })
        .expect(400);

      expect(prismaMock.contact.update).not.toHaveBeenCalled();
    });
  });

  // D7: prompt sürümleri uç noktalarının başarılı yolları.
  describe('Elif prompt uç noktaları (D7)', () => {
    beforeEach(async () => {
      // Önbelleği temizler; her test aktif sürümü baştan okur.
      await request(app.getHttpServer())
        .post('/admin/assistant/prompts/deactivate')
        .set('Authorization', admin())
        .expect(201);
      jest.clearAllMocks();
    });

    it('GET liste ADMIN icin aktif DB surumunu ve sürümleri doner', async () => {
      prismaMock.assistantPrompt.findMany.mockResolvedValue([
        {
          id: PROMPT_UUID,
          version: 2,
          note: null,
          isActive: true,
          createdAt: new Date('2026-10-20T10:00:00Z'),
          createdBy: null,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get('/admin/assistant/prompts')
        .set('Authorization', admin())
        .expect(200);

      expect(res.body.active).toEqual({
        source: 'db',
        id: PROMPT_UUID,
        version: 2,
      });
      expect(res.body.items).toHaveLength(1);
    });

    it('GET /active aktif sürüm yoksa kod içi varsayılanı doner', async () => {
      prismaMock.assistantPrompt.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/admin/assistant/prompts/active')
        .set('Authorization', admin())
        .expect(200);

      expect(res.body.source).toBe('code');
      expect(res.body.content.length).toBeGreaterThan(0);
    });

    it('GET /active aktif DB surumu varsa onu doner', async () => {
      prismaMock.assistantPrompt.findFirst.mockResolvedValue({
        id: PROMPT_UUID,
        version: 3,
        content: VALID_PROMPT,
      });

      const res = await request(app.getHttpServer())
        .get('/admin/assistant/prompts/active')
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toEqual({
        source: 'db',
        id: PROMPT_UUID,
        version: 3,
        content: VALID_PROMPT,
      });
    });

    it('GET /:id sürümü doner ve yoksa 404 verir', async () => {
      prismaMock.assistantPrompt.findUnique.mockResolvedValueOnce({
        id: PROMPT_UUID,
        version: 1,
        content: VALID_PROMPT,
      });

      const res = await request(app.getHttpServer())
        .get(`/admin/assistant/prompts/${PROMPT_UUID}`)
        .set('Authorization', admin())
        .expect(200);
      expect(res.body.version).toBe(1);

      prismaMock.assistantPrompt.findUnique.mockResolvedValueOnce(null);
      await request(app.getHttpServer())
        .get(`/admin/assistant/prompts/${PROMPT_UUID}`)
        .set('Authorization', admin())
        .expect(404);
    });

    it('POST etkinleştirmeden yeni sürüm oluşturur (version = en yüksek + 1)', async () => {
      prismaMock.$transaction.mockImplementationOnce(
        (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
      );
      prismaMock.assistantPrompt.aggregate.mockResolvedValue({
        _max: { version: 2 },
      });
      prismaMock.assistantPrompt.create.mockResolvedValue({
        id: PROMPT_UUID,
        version: 3,
        isActive: false,
      });

      const res = await request(app.getHttpServer())
        .post('/admin/assistant/prompts')
        .set('Authorization', admin())
        .send({ content: VALID_PROMPT, note: '  deneme  ' })
        .expect(201);

      expect(res.body.version).toBe(3);
      expect(prismaMock.assistantPrompt.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.assistantPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 3,
            note: 'deneme',
            isActive: false,
            createdById: MOCK_ADMIN_ID,
          }),
        }),
      );
    });

    it('POST activate=true ise onceki aktif sürümü kapatip yenisini etkinleştirir', async () => {
      prismaMock.$transaction.mockImplementationOnce(
        (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
      );
      prismaMock.assistantPrompt.aggregate.mockResolvedValue({
        _max: { version: null },
      });
      prismaMock.assistantPrompt.create.mockResolvedValue({
        id: PROMPT_UUID,
        version: 1,
        isActive: true,
      });

      await request(app.getHttpServer())
        .post('/admin/assistant/prompts')
        .set('Authorization', admin())
        .send({ content: VALID_PROMPT, activate: true })
        .expect(201);

      expect(prismaMock.assistantPrompt.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
      expect(prismaMock.assistantPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 1, isActive: true }),
        }),
      );
    });

    it('POST /:id/activate sürümü etkinleştirir ve 201 doner', async () => {
      prismaMock.assistantPrompt.findUnique
        .mockResolvedValueOnce({ id: PROMPT_UUID, version: 2 })
        .mockResolvedValueOnce({
          id: PROMPT_UUID,
          version: 2,
          isActive: true,
          content: VALID_PROMPT,
        });

      const res = await request(app.getHttpServer())
        .post(`/admin/assistant/prompts/${PROMPT_UUID}/activate`)
        .set('Authorization', admin())
        .expect(201);

      expect(res.body.version).toBe(2);
      expect(prismaMock.assistantPrompt.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
      expect(prismaMock.assistantPrompt.update).toHaveBeenCalledWith({
        where: { id: PROMPT_UUID },
        data: { isActive: true },
      });
    });

    it('POST /deactivate kod içi varsayılana döner', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/assistant/prompts/deactivate')
        .set('Authorization', admin())
        .expect(201);

      expect(res.body).toEqual({ source: 'code' });
      expect(prismaMock.assistantPrompt.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
    });
  });

  // D8: randevu oluşturma, listeleme ve durum geçişleri (e2e).
  describe('randevu uç noktaları (D8)', () => {
    const SLOT_UUID = 'b7b7b7b7-b7b7-4b7b-8b7b-b7b7b7b7b7b7';
    const futureIso = () =>
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const baseBody = () => ({
      contactId: CONTACT_UUID,
      therapistId: MOCK_EXPERT_PROFILE_ID,
      serviceType: 'BIREYSEL',
    });

    beforeEach(() => {
      prismaMock.contact.findUnique.mockResolvedValue({ id: CONTACT_UUID });
      prismaMock.expertProfile.findUnique.mockResolvedValue({
        id: MOCK_EXPERT_PROFILE_ID,
        status: 'YAYINDA',
      });
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.appointment.create.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'SCHEDULED',
      });
      prismaMock.conversation.findMany.mockResolvedValue([]);
    });

    it('POST scheduledAt ile 201 doner ve POTANSIYEL kisiyi DANISAN yapar', async () => {
      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', admin())
        .send({ ...baseBody(), scheduledAt: futureIso() })
        .expect(201);

      expect(prismaMock.contact.updateMany).toHaveBeenCalledWith({
        where: { id: CONTACT_UUID, lifecycleStatus: 'POTANSIYEL' },
        data: { lifecycleStatus: 'DANISAN' },
      });
    });

    it('POST availabilityId ile bos slota baglar ve saati Istanbul saatiyle hesaplar', async () => {
      prismaMock.availability.findUnique.mockResolvedValue({
        expertProfileId: MOCK_EXPERT_PROFILE_ID,
        date: new Date('2026-12-01T00:00:00Z'),
        startTime: '10:00',
        isBlockedByAdmin: false,
        appointment: null,
      });

      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', admin())
        .send({ ...baseBody(), availabilityId: SLOT_UUID })
        .expect(201);

      expect(prismaMock.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            availabilityId: SLOT_UUID,
            scheduledAt: new Date('2026-12-01T10:00:00+03:00'),
          }),
        }),
      );
    });

    it('POST dolu, engelli, baska uzmana ait slot veya cakisan randevu icin 409 doner', async () => {
      const slot = {
        expertProfileId: MOCK_EXPERT_PROFILE_ID,
        date: new Date('2026-12-01T00:00:00Z'),
        startTime: '10:00',
        isBlockedByAdmin: false,
        appointment: null,
      };

      prismaMock.availability.findUnique.mockResolvedValueOnce({
        ...slot,
        appointment: { id: APPOINTMENT_UUID },
      });
      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', admin())
        .send({ ...baseBody(), availabilityId: SLOT_UUID })
        .expect(409);

      prismaMock.availability.findUnique.mockResolvedValueOnce({
        ...slot,
        isBlockedByAdmin: true,
      });
      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', admin())
        .send({ ...baseBody(), availabilityId: SLOT_UUID })
        .expect(409);

      prismaMock.availability.findUnique.mockResolvedValueOnce({
        ...slot,
        expertProfileId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      });
      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', admin())
        .send({ ...baseBody(), availabilityId: SLOT_UUID })
        .expect(409);

      prismaMock.appointment.findMany.mockResolvedValueOnce([
        {
          scheduledAt: new Date(futureIso()),
          durationMinutes: 50,
        },
      ]);
      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', admin())
        .send({ ...baseBody(), scheduledAt: futureIso() })
        .expect(409);

      expect(prismaMock.appointment.create).not.toHaveBeenCalled();
    });

    it('POST onayli olmayan uzman icin 400 doner', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValueOnce({
        id: MOCK_EXPERT_PROFILE_ID,
        status: 'TASLAK',
      });

      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', admin())
        .send({ ...baseBody(), scheduledAt: futureIso() })
        .expect(400);

      expect(prismaMock.appointment.create).not.toHaveBeenCalled();
    });

    it('POST ne scheduledAt ne availabilityId gelirse 400 doner', async () => {
      await request(app.getHttpServer())
        .post('/admin/appointments')
        .set('Authorization', admin())
        .send(baseBody())
        .expect(400);
    });

    it('GET liste ADMIN icin 200 doner ve gecersiz durum filtresini reddeder', async () => {
      prismaMock.appointment.findMany.mockResolvedValue([
        { id: APPOINTMENT_UUID, status: 'SCHEDULED' },
      ]);

      const res = await request(app.getHttpServer())
        .get(
          '/admin/appointments?from=2026-10-01T00:00:00Z&to=2026-10-31T00:00:00Z&status=SCHEDULED',
        )
        .set('Authorization', admin())
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'SCHEDULED',
            scheduledAt: expect.objectContaining({
              gte: new Date('2026-10-01T00:00:00Z'),
            }),
          }),
        }),
      );

      await request(app.getHttpServer())
        .get('/admin/appointments?status=XYZ')
        .set('Authorization', admin())
        .expect(400);
    });

    it('PATCH gelecek bir randevuyu Gelmedi yapamaz (400)', async () => {
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'SCHEDULED',
        scheduledAt: new Date(futureIso()),
      });

      await request(app.getHttpServer())
        .patch(`/admin/appointments/${APPOINTMENT_UUID}/status`)
        .set('Authorization', admin())
        .send({ status: 'NO_SHOW' })
        .expect(400);

      expect(prismaMock.appointment.update).not.toHaveBeenCalled();
    });

    it('PATCH gecmis randevuyu Gelmedi yapar (200)', async () => {
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'SCHEDULED',
        scheduledAt: new Date('2025-01-01T10:00:00Z'),
      });
      prismaMock.appointment.update.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'NO_SHOW',
      });

      await request(app.getHttpServer())
        .patch(`/admin/appointments/${APPOINTMENT_UUID}/status`)
        .set('Authorization', admin())
        .send({ status: 'NO_SHOW' })
        .expect(200);
    });

    it('PATCH iptal randevunun slotunu serbest birakir (availabilityId null)', async () => {
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'SCHEDULED',
        scheduledAt: new Date(futureIso()),
      });
      prismaMock.appointment.update.mockResolvedValue({
        id: APPOINTMENT_UUID,
        status: 'CANCELLED',
      });

      await request(app.getHttpServer())
        .patch(`/admin/appointments/${APPOINTMENT_UUID}/status`)
        .set('Authorization', admin())
        .send({ status: 'CANCELLED' })
        .expect(200);

      expect(prismaMock.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'CANCELLED', availabilityId: null },
        }),
      );
    });
  });
});
