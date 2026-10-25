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

function whatsappPayload(text: string, messageId: string) {
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

function sign(raw: string, secret = META_APP_SECRET): string {
  return (
    'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
  );
}

describe('Webhooks Meta (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

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

  // Yeni kişi + yeni konuşma + yeni mesaj akışı için varsayılan yanıtlar
  const restoreDefaults = () => {
    prismaMock.contact.findFirst.mockResolvedValue(null);
    prismaMock.contact.create.mockResolvedValue({ id: CONTACT_ID });
    prismaMock.contact.update.mockResolvedValue({ id: CONTACT_ID });
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    prismaMock.conversation.create.mockResolvedValue({
      id: CONVERSATION_ID,
      flaggedCrisis: false,
    });
    prismaMock.conversation.update.mockResolvedValue({});
    prismaMock.message.create.mockResolvedValue({ id: MESSAGE_ID });
  };

  beforeAll(async () => {
    prismaMock = buildPrismaMock();

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

  it('imzali WhatsApp metin mesaji 200 doner ve kaydedilir', async () => {
    const raw = JSON.stringify(whatsappPayload('Merhaba', 'wamid.TEST1'));

    const res = await postSigned(raw).expect(200);

    expect(res.body).toEqual({ received: true });
    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: CONVERSATION_ID,
        senderType: 'CLIENT',
        content: 'Merhaba',
        metaMessageId: 'wamid.TEST1',
      }),
    });
    expect(assistantMock.handleIncoming).toHaveBeenCalledWith(
      CONVERSATION_ID,
      'Merhaba',
      { kind: 'text' },
    );
  });

  it('PENDING_AGENT konusma varken yeni mesaj mevcut konusmaya eklenir', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue({
      id: CONVERSATION_ID,
      status: 'PENDING_AGENT',
      flaggedCrisis: false,
    });
    const raw = JSON.stringify(whatsappPayload('Yeni mesaj', 'wamid.TEST2'));

    await postSigned(raw).expect(200);

    expect(prismaMock.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['OPEN', 'PENDING_AGENT'] },
        }),
      }),
    );
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: CONVERSATION_ID,
        content: 'Yeni mesaj',
      }),
    });
  });

  it('imzasiz istek 403 doner ve mesaj kaydedilmez', async () => {
    const raw = JSON.stringify(whatsappPayload('Merhaba', 'wamid.TEST3'));

    await request(app.getHttpServer())
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(403);

    expect(prismaMock.message.create).not.toHaveBeenCalled();
    expect(assistantMock.handleIncoming).not.toHaveBeenCalled();
  });

  it('yanlis anahtarla uretilmis imza 403 doner', async () => {
    const raw = JSON.stringify(whatsappPayload('Merhaba', 'wamid.TEST4'));

    await postSigned(raw, sign(raw, 'yanlis-secret')).expect(403);

    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });
});
