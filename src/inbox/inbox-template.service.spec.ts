import 'reflect-metadata';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InboxTemplateService } from './inbox-template.service';
import { SendTemplateDto } from './dto/send-template.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

const TEMPLATE_ID = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

const approvedTemplate = {
  id: TEMPLATE_ID,
  name: 'randevu_hatirlatma',
  language: 'tr',
  bodyText: 'Merhaba {{1}}, {{2}} saat {{3}}de görüşmeniz var.',
  variableCount: 3,
};

function buildConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    status: 'OPEN',
    channel: 'WHATSAPP',
    isBotActive: false,
    assignedUserId: null,
    assignedUser: null,
    contact: { phone: '905550000000' },
    ...overrides,
  };
}

function buildDto(overrides: Partial<SendTemplateDto> = {}): SendTemplateDto {
  return {
    templateId: TEMPLATE_ID,
    params: ['Ayşe', '27 Ekim Pazartesi', '14:00'],
    ...overrides,
  };
}

describe('InboxTemplateService', () => {
  let prisma: {
    conversation: { findUnique: jest.Mock; update: jest.Mock };
    message: { create: jest.Mock };
  };
  let meta: { sendTemplate: jest.Mock };
  let events: { emit: jest.Mock };
  let templates: { getApproved: jest.Mock };
  let conversation: ReturnType<typeof buildConversation>;

  function build(withPort = true): InboxTemplateService {
    return new InboxTemplateService(
      prisma as unknown as PrismaService,
      meta as unknown as MetaSenderService,
      events as unknown as InboxEventsService,
      withPort ? templates : undefined,
    );
  }

  beforeEach(() => {
    conversation = buildConversation();
    prisma = {
      conversation: {
        findUnique: jest.fn().mockImplementation(() => conversation),
        update: jest.fn().mockResolvedValue({}),
      },
      message: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 'msg-1',
          createdAt: new Date(0),
          ...data,
        })),
      },
    };
    meta = {
      sendTemplate: jest
        .fn()
        .mockResolvedValue({ ok: true, messageId: 'wamid.t1' }),
    };
    events = { emit: jest.fn() };
    templates = {
      getApproved: jest.fn().mockResolvedValue(approvedTemplate),
    };
  });

  it('konuşma yoksa NotFound fırlatır', async () => {
    conversation = null as unknown as ReturnType<typeof buildConversation>;
    await expect(
      build().sendTemplate('x', buildDto(), 'agent-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('kapalı konuşmaya şablon gönderilmez', async () => {
    conversation = buildConversation({ status: 'CLOSED' });
    await expect(
      build().sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(ConflictException);
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });

  it('başka personelin konuşmasında force olmadan 409 döner, force ile gönderir', async () => {
    conversation = buildConversation({
      assignedUserId: 'agent-2',
      assignedUser: { id: 'agent-2', firstName: 'Ali', lastName: 'Veli' },
    });
    await expect(
      build().sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(ConflictException);
    expect(meta.sendTemplate).not.toHaveBeenCalled();

    await build().sendTemplate('conv-1', buildDto({ force: true }), 'agent-1');
    expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
  });

  it('yalnızca WhatsApp konuşmasında gönderilir (Instagram 400)', async () => {
    conversation = buildConversation({ channel: 'INSTAGRAM' });
    await expect(
      build().sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(BadRequestException);
    expect(templates.getApproved).not.toHaveBeenCalled();
  });

  it('şablon bağlantı noktası yoksa 503 döner', async () => {
    await expect(
      build(false).sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('onaylı olmayan şablon hatası (getApproved) aynen iletilir', async () => {
    templates.getApproved.mockRejectedValue(
      new BadRequestException('onaylı değil'),
    );
    await expect(
      build().sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(BadRequestException);
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });

  it('değişken sayısı şablonla eşleşmezse 400 döner', async () => {
    await expect(
      build().sendTemplate('conv-1', buildDto({ params: ['Ayşe'] }), 'agent-1'),
    ).rejects.toThrow(BadRequestException);
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });

  it('telefonu olmayan danışana 400 döner', async () => {
    conversation = buildConversation({ contact: { phone: null } });
    await expect(
      build().sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('yerel biçimli telefonu E.164 olarak gönderir', async () => {
    conversation = buildConversation({ contact: { phone: '0555 000 00 00' } });
    await build().sendTemplate('conv-1', buildDto(), 'agent-1');

    expect(meta.sendTemplate.mock.calls[0][0]).toBe('905550000000');
  });

  it('geçersiz telefonlu danışana 400 döner ve gönderilmez', async () => {
    conversation = buildConversation({ contact: { phone: '12' } });
    await expect(
      build().sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(BadRequestException);
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });

  it('başarılı gönderimde AGENT mesajı şablon adı ve doldurulmuş metinle kaydedilir', async () => {
    const message = await build().sendTemplate('conv-1', buildDto(), 'agent-1');

    expect(meta.sendTemplate).toHaveBeenCalledWith('905550000000', {
      name: 'randevu_hatirlatma',
      language: 'tr',
      params: ['Ayşe', '27 Ekim Pazartesi', '14:00'],
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conv-1',
        senderType: 'AGENT',
        agentUserId: 'agent-1',
        content: 'Merhaba Ayşe, 27 Ekim Pazartesi saat 14:00de görüşmeniz var.',
        templateName: 'randevu_hatirlatma',
        metaMessageId: 'wamid.t1',
        deliveryStatus: 'SENT',
      }),
      include: expect.any(Object),
    });
    expect(message.templateName).toBe('randevu_hatirlatma');
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-1' },
        data: expect.objectContaining({
          assignedUserId: 'agent-1',
        }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'message.created',
      expect.objectContaining({ conversationId: 'conv-1' }),
    );
  });

  it('Elif aktifken şablon gönderilince bot devre dışı kalır', async () => {
    conversation = buildConversation({ isBotActive: true });
    await build().sendTemplate('conv-1', buildDto(), 'agent-1');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { isBotActive: false, status: 'PENDING_AGENT' },
    });
  });

  it('Meta gönderimi başarısızsa 502 ve Meta hatası döner; kayıt yazılmaz', async () => {
    meta.sendTemplate.mockResolvedValue({ ok: false, error: 'HTTP 400: hata' });
    await expect(
      build().sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(BadGatewayException);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('Elif aktifken gönderim başarısızsa bot devralınmaz, konuşma değişmez', async () => {
    conversation = buildConversation({ isBotActive: true });
    meta.sendTemplate.mockResolvedValue({ ok: false, error: 'HTTP 500' });
    await expect(
      build().sendTemplate('conv-1', buildDto(), 'agent-1'),
    ).rejects.toThrow(BadGatewayException);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  describe('SendTemplateDto doğrulaması', () => {
    it('geçerli girdi hata üretmez', async () => {
      const errors = await validate(
        plainToInstance(SendTemplateDto, {
          templateId: TEMPLATE_ID,
          params: ['a', 'b'],
        }),
      );
      expect(errors).toHaveLength(0);
    });

    it('UUID olmayan şablon kimliği ve boş değişken reddedilir', async () => {
      const errors = await validate(
        plainToInstance(SendTemplateDto, {
          templateId: 'abc',
          params: ['a', ''],
        }),
      );
      const props = errors.map((e) => e.property);
      expect(props).toEqual(expect.arrayContaining(['templateId', 'params']));
    });

    it('500 karakteri aşan değişken reddedilir', async () => {
      const errors = await validate(
        plainToInstance(SendTemplateDto, {
          templateId: TEMPLATE_ID,
          params: ['x'.repeat(501)],
        }),
      );
      expect(errors.map((e) => e.property)).toContain('params');
    });
  });
});
