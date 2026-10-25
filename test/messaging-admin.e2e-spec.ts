import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';

import { InboxModule } from '../src/inbox/inbox.module';
import { MessagingModule } from '../src/messaging/messaging.module';
import { MetaTemplatesClient } from '../src/messaging/templates/meta-templates.client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageModule } from '../src/storage/storage.module';
import { StorageService } from '../src/storage/storage.service';
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
  uzmanToken,
  bearerHeader,
  TEST_JWT_SECRET,
} from './helpers/auth.helper';
import { buildMailMock } from './helpers/create-test-app';

process.env.JWT_ACCESS_SECRET = TEST_JWT_SECRET;
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';

const CONVERSATION_ID = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';
const TEMPLATE_ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const LIST_ID = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const CAMPAIGN_ID = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';

// buildPrismaMock'ta bulunmayan modeller için yalın mock'lar.
const modelMock = (...names: string[]): Record<string, jest.Mock> =>
  Object.fromEntries(names.map((n) => [n, jest.fn()]));

describe('Messaging admin (e2e)', () => {
  let app: INestApplication;

  const prismaMock = {
    ...buildPrismaMock(),
    whatsAppTemplate: modelMock(
      'findMany',
      'findUnique',
      'create',
      'update',
      'upsert',
      'updateMany',
    ),
    systemSetting: modelMock('findFirst', 'update', 'create'),
    contactList: modelMock(
      'findMany',
      'findUnique',
      'findFirst',
      'create',
      'update',
      'delete',
      'count',
    ),
    contactListMember: modelMock(
      'findMany',
      'count',
      'createMany',
      'deleteMany',
    ),
    appointmentReminder: modelMock(
      'findMany',
      'findUnique',
      'count',
      'create',
      'update',
      'updateMany',
    ),
    campaign: modelMock(
      'findMany',
      'findUnique',
      'findFirst',
      'create',
      'update',
      'updateMany',
      'count',
    ),
    campaignRecipient: modelMock(
      'findMany',
      'findFirst',
      'count',
      'updateMany',
      'createMany',
    ),
  };

  const mailMock = buildMailMock();
  const metaSenderMock = {
    sendText: jest.fn().mockResolvedValue({ ok: true }),
    sendTemplate: jest
      .fn()
      .mockResolvedValue({ ok: true, messageId: 'wamid.e2e' }),
  };
  const knowledgeMock = {
    createEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    recordUnanswered: jest.fn(),
  };
  const metaTemplatesMock = {
    assertConfigured: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'meta-tpl-1' }),
    listAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  };

  const restoreDefaults = () => {
    prismaMock.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }) => {
        if (where.id === MOCK_ADMIN_ID) return Promise.resolve(mockAdminUser());
        if (where.id === MOCK_UZMAN_ID) return Promise.resolve(mockUzmanUser());
        if (where.id === MOCK_DANISAN_ID)
          return Promise.resolve(mockDanisanUser());
        return Promise.resolve(null);
      },
    );
    // Varsayılan: kampanyalar ve hatırlatmalar kapalı.
    prismaMock.systemSetting.findFirst.mockResolvedValue({
      id: 'settings-1',
      campaignsEnabled: false,
      campaignUnitPrice: null,
      reminderEnabled: false,
      reminderShortMinutes: 60,
      reminderQuietStart: 21,
      reminderQuietEnd: 9,
      reminderDayBeforeTemplateId: null,
      reminderShortTemplateId: null,
    });
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        StorageModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({}),
        MessagingModule,
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
      .overrideProvider(MetaTemplatesClient)
      .useValue(metaTemplatesMock)
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
    restoreDefaults();
  });

  const admin = () => bearerHeader(adminToken());
  const uzman = () => bearerHeader(uzmanToken());
  const http = () => request(app.getHttpServer());

  describe('Yetkilendirme (UZMAN 403)', () => {
    it('GET /admin/whatsapp/templates UZMAN icin 403', async () => {
      await http()
        .get('/admin/whatsapp/templates')
        .set('Authorization', uzman())
        .expect(403);
    });

    it('GET /admin/contacts UZMAN icin 403', async () => {
      await http()
        .get('/admin/contacts')
        .set('Authorization', uzman())
        .expect(403);
    });

    it('GET /admin/contact-lists UZMAN icin 403', async () => {
      await http()
        .get('/admin/contact-lists')
        .set('Authorization', uzman())
        .expect(403);
    });

    it('GET /admin/campaigns/settings UZMAN icin 403', async () => {
      await http()
        .get('/admin/campaigns/settings')
        .set('Authorization', uzman())
        .expect(403);
    });

    it('GET /admin/reminders/settings UZMAN icin 403', async () => {
      await http()
        .get('/admin/reminders/settings')
        .set('Authorization', uzman())
        .expect(403);
    });

    it('sablon gonderimi UZMAN icin 403', async () => {
      await http()
        .post(`/admin/inbox/conversations/${CONVERSATION_ID}/template`)
        .set('Authorization', uzman())
        .send({ templateId: TEMPLATE_ID, params: [] })
        .expect(403);
    });
  });

  describe('Şablonlar', () => {
    it('ADMIN listeler (200)', async () => {
      prismaMock.whatsAppTemplate.findMany.mockResolvedValue([]);
      await http()
        .get('/admin/whatsapp/templates')
        .set('Authorization', admin())
        .expect(200);
    });

    it('gecersiz ad 400 doner ve Meta cagrilmaz', async () => {
      await http()
        .post('/admin/whatsapp/templates')
        .set('Authorization', admin())
        .send({
          name: 'Geçersiz Ad!',
          category: 'UTILITY',
          bodyText: 'Merhaba {{1}}',
          examples: ['Ahmet'],
        })
        .expect(400);
      expect(metaTemplatesMock.create).not.toHaveBeenCalled();
    });

    it('gecerli sablon Meta a gonderilir ve kaydedilir', async () => {
      prismaMock.whatsAppTemplate.findUnique.mockResolvedValue(null);
      prismaMock.whatsAppTemplate.create.mockResolvedValue({
        id: TEMPLATE_ID,
        name: 'randevu_hatirlatma',
        status: 'PENDING',
      });
      await http()
        .post('/admin/whatsapp/templates')
        .set('Authorization', admin())
        .send({
          name: 'randevu_hatirlatma',
          category: 'UTILITY',
          bodyText: 'Merhaba {{1}}',
          examples: ['Ahmet'],
        })
        .expect(201);
      expect(metaTemplatesMock.create).toHaveBeenCalledTimes(1);
    });
  });

  // Gerçek bağlantı: InboxModule, MessagingModule'deki TemplatesService'i
  // kullanır; onaylı şablon Prisma mock'undan okunur.
  describe('Inbox şablon gönderimi', () => {
    const approvedRow = {
      id: TEMPLATE_ID,
      name: 'randevu_hatirlatma',
      language: 'tr',
      bodyText: 'Merhaba {{1}}, {{2}} saat {{3}}',
      variableCount: 3,
      status: 'APPROVED',
    };
    const whatsappConversation = {
      id: CONVERSATION_ID,
      status: 'OPEN',
      channel: 'WHATSAPP',
      isBotActive: false,
      assignedUserId: null,
      assignedUser: null,
      contact: { id: 'c1', phone: '905550000000', fullName: 'Ahmet Yılmaz' },
    };
    const sendUrl = `/admin/inbox/conversations/${CONVERSATION_ID}/template`;

    beforeEach(() => {
      prismaMock.conversation.findUnique.mockResolvedValue(
        whatsappConversation,
      );
      prismaMock.whatsAppTemplate.findUnique.mockResolvedValue(approvedRow);
      prismaMock.message.create.mockResolvedValue({
        id: 'm-1',
        createdAt: new Date('2026-10-25T10:00:00Z'),
        senderType: 'AGENT',
        content: 'Merhaba Ahmet, 27 Ekim saat 14:00',
        templateName: 'randevu_hatirlatma',
      });
    });

    it('params sayisi yanlis ise 400 doner', async () => {
      await http()
        .post(sendUrl)
        .set('Authorization', admin())
        .send({ templateId: TEMPLATE_ID, params: ['tek'] })
        .expect(400);
      expect(metaSenderMock.sendTemplate).not.toHaveBeenCalled();
    });

    it('onaylı olmayan şablon 400 doner ve Meta a gitmez', async () => {
      prismaMock.whatsAppTemplate.findUnique.mockResolvedValue({
        ...approvedRow,
        status: 'PENDING',
      });
      await http()
        .post(sendUrl)
        .set('Authorization', admin())
        .send({ templateId: TEMPLATE_ID, params: ['a', 'b', 'c'] })
        .expect(400);
      expect(metaSenderMock.sendTemplate).not.toHaveBeenCalled();
    });

    it('Instagram konuşmasında 400 doner', async () => {
      prismaMock.conversation.findUnique.mockResolvedValue({
        ...whatsappConversation,
        channel: 'INSTAGRAM',
      });
      await http()
        .post(sendUrl)
        .set('Authorization', admin())
        .send({ templateId: TEMPLATE_ID, params: ['a', 'b', 'c'] })
        .expect(400);
      expect(metaSenderMock.sendTemplate).not.toHaveBeenCalled();
    });

    it('geçerli istek Meta ya gönderilir ve AGENT mesajı şablon adıyla kaydedilir', async () => {
      await http()
        .post(sendUrl)
        .set('Authorization', admin())
        .send({
          templateId: TEMPLATE_ID,
          params: ['Ahmet', '27 Ekim', '14:00'],
        })
        .expect(201);

      expect(metaSenderMock.sendTemplate).toHaveBeenCalledWith('905550000000', {
        name: 'randevu_hatirlatma',
        language: 'tr',
        params: ['Ahmet', '27 Ekim', '14:00'],
      });
      expect(prismaMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderType: 'AGENT',
            templateName: 'randevu_hatirlatma',
            metaMessageId: 'wamid.e2e',
            content: 'Merhaba Ahmet, 27 Ekim saat 14:00',
          }),
        }),
      );
    });
  });

  describe('Hatırlatma ayarları', () => {
    it('ADMIN ayarlari okur ve varsayilan olarak kapali doner', async () => {
      prismaMock.systemSetting.findFirst.mockResolvedValue(null);
      const res = await http()
        .get('/admin/reminders/settings')
        .set('Authorization', admin())
        .expect(200);
      expect(res.body.reminderEnabled).toBe(false);
    });

    it('dakika araligi disindaki deger 400 doner', async () => {
      await http()
        .patch('/admin/reminders/settings')
        .set('Authorization', admin())
        .send({ reminderShortMinutes: 2 })
        .expect(400);
      expect(prismaMock.systemSetting.update).not.toHaveBeenCalled();
    });
  });

  describe('Kişiler', () => {
    it('ADMIN listeler (200)', async () => {
      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);
      const res = await http()
        .get('/admin/contacts')
        .set('Authorization', admin())
        .expect(200);
      expect(res.body).toMatchObject({ total: 0 });
    });

    it('gecersiz filtre degeri 400 doner', async () => {
      await http()
        .get('/admin/contacts?contactType=BILINMEYEN')
        .set('Authorization', admin())
        .expect(400);
    });
  });

  describe('Kişi listeleri', () => {
    it('ayni isimde liste 409 doner', async () => {
      prismaMock.contactList.findFirst.mockResolvedValue({ id: LIST_ID });
      await http()
        .post('/admin/contact-lists')
        .set('Authorization', admin())
        .send({ name: 'Mevcut Liste' })
        .expect(409);
      expect(prismaMock.contactList.create).not.toHaveBeenCalled();
    });

    it('yeni liste olusturur (201)', async () => {
      prismaMock.contactList.findFirst.mockResolvedValue(null);
      prismaMock.contactList.create.mockResolvedValue({
        id: LIST_ID,
        name: 'Yeni Liste',
      });
      await http()
        .post('/admin/contact-lists')
        .set('Authorization', admin())
        .send({ name: 'Yeni Liste' })
        .expect(201);
    });

    it('bos ad 400 doner', async () => {
      await http()
        .post('/admin/contact-lists')
        .set('Authorization', admin())
        .send({ name: '' })
        .expect(400);
    });
  });

  describe('Kampanyalar', () => {
    it('ADMIN ayarlari okur; kampanyalar varsayilan kapali', async () => {
      const res = await http()
        .get('/admin/campaigns/settings')
        .set('Authorization', admin())
        .expect(200);
      expect(res.body.campaignsEnabled).toBe(false);
    });

    it('paramMapping eksikse 400 doner', async () => {
      prismaMock.whatsAppTemplate.findUnique.mockResolvedValue({
        id: TEMPLATE_ID,
        status: 'APPROVED',
        category: 'MARKETING',
        variableCount: 2,
      });
      await http()
        .post('/admin/campaigns')
        .set('Authorization', admin())
        .send({
          name: 'Kampanya 1',
          templateId: TEMPLATE_ID,
          paramMapping: [],
        })
        .expect(400);
      expect(prismaMock.campaign.create).not.toHaveBeenCalled();
    });

    it('kampanyalar kapaliyken gonderim 400 doner', async () => {
      await http()
        .post(`/admin/campaigns/${CAMPAIGN_ID}/send`)
        .set('Authorization', admin())
        .expect(400);
      expect(prismaMock.campaign.updateMany).not.toHaveBeenCalled();
    });
  });
});
