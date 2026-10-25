import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import request from 'supertest';

import { WebhooksModule } from '../src/webhooks/webhooks.module';
import { AssistantService } from '../src/assistant/assistant.service';
import { KnowledgeService } from '../src/assistant/knowledge.service';
import { MetaSenderService } from '../src/webhooks/meta-sender.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageModule } from '../src/storage/storage.module';
import { StorageService } from '../src/storage/storage.service';
import { MailService } from '../src/mail/mail.service';
import { buildPrismaMock } from './helpers/prisma-mock';
import { buildMailMock } from './helpers/create-test-app';

const META_APP_SECRET = 'test-meta-app-secret';
process.env.META_APP_SECRET = META_APP_SECRET;

const CONTACT_ID = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
const CONVERSATION_ID = 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2';
const MESSAGE_ID = 'f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3';
const OUTBOUND_ID = 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4';

const modelMock = (...names: string[]): Record<string, jest.Mock> =>
  Object.fromEntries(names.map((n) => [n, jest.fn()]));

function sign(raw: string, secret = META_APP_SECRET): string {
  return (
    'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
  );
}

function whatsappMessagePayload(text: string, messageId: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '902120000000',
                phone_number_id: 'PHONE_ID',
              },
              contacts: [{ wa_id: '905321234567', profile: { name: 'Ahmet' } }],
              messages: [
                {
                  from: '905321234567',
                  id: messageId,
                  timestamp: '1760000000',
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// Giden mesajın teslim durumu olayı (value.statuses[]).
function whatsappStatusPayload(metaMessageId: string, status: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '902120000000',
                phone_number_id: 'PHONE_ID',
              },
              statuses: [
                {
                  id: metaMessageId,
                  status,
                  timestamp: '1760000100',
                  recipient_id: '905321234567',
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('Webhooks Meta - teslim durumu ve DUR (e2e)', () => {
  let app: INestApplication;
  const prismaMock = {
    ...buildPrismaMock(),
    appointmentReminder: modelMock('findMany', 'updateMany', 'update'),
    campaignRecipient: modelMock('findMany', 'findFirst', 'updateMany'),
    campaign: modelMock('findUnique', 'update', 'updateMany'),
  };

  const assistantMock = {
    handleIncoming: jest.fn().mockResolvedValue(undefined),
    handleCrisis: jest.fn().mockResolvedValue(undefined),
  };
  const metaSenderMock = {
    sendText: jest.fn().mockResolvedValue({ ok: true }),
  };
  const knowledgeMock = {
    createEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    recordUnanswered: jest.fn(),
  };
  const mailMock = buildMailMock();

  const restoreDefaults = () => {
    prismaMock.contact.findFirst.mockResolvedValue(null);
    prismaMock.contact.create.mockResolvedValue({ id: CONTACT_ID });
    prismaMock.contact.update.mockResolvedValue({ id: CONTACT_ID });
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    prismaMock.conversation.findUnique.mockResolvedValue(null);
    prismaMock.conversation.create.mockResolvedValue({
      id: CONVERSATION_ID,
      flaggedCrisis: false,
    });
    prismaMock.conversation.update.mockResolvedValue({});
    prismaMock.message.create.mockResolvedValue({ id: MESSAGE_ID });
    prismaMock.message.findUnique.mockResolvedValue(null);
    prismaMock.message.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.appointmentReminder.findMany.mockResolvedValue([]);
    prismaMock.appointmentReminder.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.campaignRecipient.findMany.mockResolvedValue([]);
    prismaMock.campaignRecipient.findFirst.mockResolvedValue(null);
    prismaMock.campaignRecipient.updateMany.mockResolvedValue({ count: 0 });
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        StorageModule,
        WebhooksModule,
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
      .overrideProvider(AssistantService)
      .useValue(assistantMock)
      .overrideProvider(MetaSenderService)
      .useValue(metaSenderMock)
      .overrideProvider(KnowledgeService)
      .useValue(knowledgeMock)
      .compile();

    // main.ts ile aynı: imza doğrulaması ham gövdeye bağlı
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    restoreDefaults();
  });

  const postSigned = (raw: string, signature = sign(raw)) =>
    request(app.getHttpServer())
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(raw);

  it('imzali teslim durumu 200 doner ve mesaj durumu guncellenir', async () => {
    prismaMock.message.findUnique.mockResolvedValue({
      id: OUTBOUND_ID,
      conversationId: CONVERSATION_ID,
      deliveryStatus: 'SENT',
    });
    prismaMock.message.updateMany.mockResolvedValue({ count: 1 });
    const raw = JSON.stringify(
      whatsappStatusPayload('wamid.OUT1', 'delivered'),
    );

    const res = await postSigned(raw).expect(200);

    expect(res.body).toEqual({ received: true });
    expect(prismaMock.message.updateMany).toHaveBeenCalledWith({
      where: { id: OUTBOUND_ID, deliveryStatus: 'SENT' },
      data: expect.objectContaining({ deliveryStatus: 'DELIVERED' }),
    });
  });

  it('imzasiz teslim durumu 403 doner ve guncelleme yapilmaz', async () => {
    const raw = JSON.stringify(
      whatsappStatusPayload('wamid.OUT2', 'delivered'),
    );

    await request(app.getHttpServer())
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sign(raw, 'yanlis-secret'))
      .send(raw)
      .expect(403);

    expect(prismaMock.message.updateMany).not.toHaveBeenCalled();
  });

  it('imzali DUR mesaji danisanin otomatik mesajlarini kapatir', async () => {
    prismaMock.conversation.findUnique.mockResolvedValue({
      contactId: CONTACT_ID,
      channel: 'WHATSAPP',
    });
    const raw = JSON.stringify(whatsappMessagePayload('DUR', 'wamid.DUR1'));

    await postSigned(raw).expect(200);

    expect(prismaMock.contact.update).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
      data: expect.objectContaining({
        reminderOptOut: true,
        marketingOptOut: true,
      }),
    });
    // DUR mesajına asistan cevap vermez.
    expect(assistantMock.handleIncoming).not.toHaveBeenCalled();
  });
});
