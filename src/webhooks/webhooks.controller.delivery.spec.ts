import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RawBodyRequest } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookFollowupService } from './webhook-followup.service';
import { AssistantService } from '../assistant/assistant.service';
import * as crypto from './crypto';
import { MetaWebhookBody } from './dto/meta-webhook-payload.dto';

const secret = 'test-secret';
const config = {
  get: jest.fn((key: string) =>
    key === 'META_APP_SECRET' ? secret : undefined,
  ),
} as unknown as ConfigService;

function buildRequest(body: MetaWebhookBody): RawBodyRequest<Request> {
  const raw = JSON.stringify(body);
  return {
    rawBody: Buffer.from(raw, 'utf8'),
    headers: {
      'x-hub-signature-256': 'sha256=' + crypto.hmacSha256Hex(secret, raw),
    },
    body,
  } as unknown as RawBodyRequest<Request>;
}

const normalized = {
  channel: 'WHATSAPP',
  externalContactId: '905550000000',
  metaMessageId: 'wamid.in1',
  content: 'DUR',
  kind: 'text',
  timestamp: new Date(0),
};

function buildMocks(outcome: Record<string, unknown>) {
  const webhooks = {
    extractMessages: jest.fn().mockReturnValue([normalized]),
    extractInstagramEchoes: jest.fn().mockReturnValue([]),
    processIncomingMessage: jest.fn().mockResolvedValue({
      conversationId: 'conv-1',
      isNew: true,
      crisis: false,
      crisisNew: false,
      kind: 'text',
      messageId: 'msg-1',
      standby: false,
      ...outcome,
    }),
  };
  const assistant = {
    handleIncoming: jest.fn().mockResolvedValue(undefined),
    handleCrisis: jest.fn().mockResolvedValue(undefined),
  };
  const followup = {
    handleInboundMessage: jest.fn().mockResolvedValue(false),
    applyWhatsAppStatuses: jest.fn().mockResolvedValue(undefined),
    applyInstagramRead: jest.fn().mockResolvedValue(undefined),
  };
  const templateStatus = { handle: jest.fn().mockResolvedValue(undefined) };
  return { webhooks, assistant, followup, templateStatus };
}

describe('WebhooksController (teslim ve DUR)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('DUR mesajında asistan çağrılmaz', async () => {
    const m = buildMocks({});
    m.followup.handleInboundMessage.mockResolvedValue(true);
    const controller = new WebhooksController(
      m.webhooks as unknown as WebhooksService,
      config,
      m.assistant as unknown as AssistantService,
      m.followup as unknown as WebhookFollowupService,
    );

    const result = await controller.receive(
      buildRequest({ object: 'x', entry: [] }),
    );

    expect(result).toEqual({ received: true });
    expect(m.assistant.handleIncoming).not.toHaveBeenCalled();
    expect(m.assistant.handleCrisis).not.toHaveBeenCalled();
  });

  it('DUR olsa da kriz işaretliyse kriz akışı çalışır', async () => {
    const m = buildMocks({ crisis: true, crisisNew: true });
    m.followup.handleInboundMessage.mockResolvedValue(true);
    const controller = new WebhooksController(
      m.webhooks as unknown as WebhooksService,
      config,
      m.assistant as unknown as AssistantService,
      m.followup as unknown as WebhookFollowupService,
    );

    await controller.receive(buildRequest({ object: 'x', entry: [] }));

    expect(m.assistant.handleCrisis).toHaveBeenCalledWith('conv-1');
  });

  it('normal mesajda asistan çağrılır', async () => {
    const m = buildMocks({});
    const controller = new WebhooksController(
      m.webhooks as unknown as WebhooksService,
      config,
      m.assistant as unknown as AssistantService,
      m.followup as unknown as WebhookFollowupService,
    );

    await controller.receive(buildRequest({ object: 'x', entry: [] }));
    await new Promise((resolve) => setImmediate(resolve));

    expect(m.assistant.handleIncoming).toHaveBeenCalledWith('conv-1', 'DUR', {
      kind: 'text',
      draftOnly: false,
    });
  });

  it('WhatsApp statuses olayları takip servisine verilir', async () => {
    const m = buildMocks({});
    m.webhooks.extractMessages.mockReturnValue([]);
    const controller = new WebhooksController(
      m.webhooks as unknown as WebhooksService,
      config,
      m.assistant as unknown as AssistantService,
      m.followup as unknown as WebhookFollowupService,
    );
    const statuses = [{ id: 'wamid.s1', status: 'read' }];

    await controller.receive(
      buildRequest({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'e1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '1', display_phone_number: '1' },
                  statuses,
                },
              },
            ],
          },
        ],
      }),
    );

    expect(m.followup.applyWhatsAppStatuses).toHaveBeenCalledWith(statuses);
  });

  it('şablon durum olayı şablon bağlantı noktasına verilir', async () => {
    const m = buildMocks({});
    m.webhooks.extractMessages.mockReturnValue([]);
    const controller = new WebhooksController(
      m.webhooks as unknown as WebhooksService,
      config,
      m.assistant as unknown as AssistantService,
      m.followup as unknown as WebhookFollowupService,
      m.templateStatus,
    );
    const value = {
      messaging_product: 'whatsapp' as const,
      metadata: { phone_number_id: '1', display_phone_number: '1' },
      event: 'APPROVED',
      message_template_name: 'randevu_hatirlatma',
    };

    await controller.receive(
      buildRequest({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'e1',
            changes: [{ field: 'message_template_status_update', value }],
          },
        ],
      }),
    );

    expect(m.templateStatus.handle).toHaveBeenCalledWith(value);
  });

  it('Instagram okuma olayları takip servisine verilir', async () => {
    const m = buildMocks({});
    m.webhooks.extractMessages.mockReturnValue([]);
    const controller = new WebhooksController(
      m.webhooks as unknown as WebhooksService,
      config,
      m.assistant as unknown as AssistantService,
      m.followup as unknown as WebhookFollowupService,
    );
    const readEvent = {
      sender: { id: 'igsid-1' },
      recipient: { id: 'page' },
      timestamp: 5,
      read: { watermark: 5 },
    };

    await controller.receive(
      buildRequest({
        object: 'instagram',
        entry: [{ id: 'e2', messaging: [readEvent] }],
      }),
    );

    expect(m.followup.applyInstagramRead).toHaveBeenCalledWith(readEvent);
  });

  it('takip servisi hata verse de webhook yanıtı başarılı kalır', async () => {
    const m = buildMocks({});
    m.webhooks.extractMessages.mockReturnValue([]);
    m.followup.applyWhatsAppStatuses.mockRejectedValue(new Error('db'));
    const controller = new WebhooksController(
      m.webhooks as unknown as WebhooksService,
      config,
      m.assistant as unknown as AssistantService,
      m.followup as unknown as WebhookFollowupService,
    );

    const result = await controller.receive(
      buildRequest({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'e1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '1', display_phone_number: '1' },
                  statuses: [{ id: 'wamid.s2', status: 'sent' }],
                },
              },
            ],
          },
        ],
      }),
    );

    expect(result).toEqual({ received: true });
  });
});
