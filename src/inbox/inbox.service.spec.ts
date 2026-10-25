import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InboxService } from './inbox.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { ConversationSummaryService } from '../assistant/conversation-summary.service';

const HOUR = 60 * 60 * 1000;

function buildPrismaMock() {
  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any, any>(),
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      update: jest.fn<any, any>(),
      count: jest.fn<any, any>().mockResolvedValue(0),
    },
    message: {
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      create: jest.fn<any, any>(),
    },
    contact: {
      findUnique: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
    },
    lead: {
      count: jest.fn<any, any>().mockResolvedValue(0),
      findMany: jest.fn<any, any>().mockResolvedValue([]),
    },
    appointment: { findMany: jest.fn<any, any>().mockResolvedValue([]) },
    unansweredQuestion: { count: jest.fn<any, any>().mockResolvedValue(0) },
    user: { findUnique: jest.fn<any, any>() },
    conversationRead: {
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      upsert: jest.fn<any, any>().mockResolvedValue({ id: 'read-1' }),
    },
    contactTag: { count: jest.fn<any, any>().mockResolvedValue(0) },
    $queryRaw: jest.fn<any, any>().mockResolvedValue([]),
  };
  prisma.$transaction = jest.fn<any, any>((ops: Promise<unknown>[]) =>
    Promise.all(ops),
  );
  return prisma;
}

let humanAgentTagFlag = false;

function withHumanAgentTag(enabled: boolean) {
  humanAgentTagFlag = enabled;
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    contactId: 'contact-1',
    channel: 'WHATSAPP',
    isBotActive: true,
    flaggedCrisis: false,
    status: 'OPEN',
    contact: { id: 'contact-1', phone: '905550001122', instagramId: null },
    ...overrides,
  };
}

describe('InboxService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let metaSender: { sendText: jest.Mock };
  let inboxEvents: { emit: jest.Mock; stream: jest.Mock };
  let config: { get: jest.Mock };
  let service: InboxService;
  let summary: { summarize: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    metaSender = {
      sendText: jest.fn<any, any>().mockResolvedValue({ ok: true }),
    };
    inboxEvents = { emit: jest.fn<any, any>(), stream: jest.fn<any, any>() };
    humanAgentTagFlag = false;
    config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'INSTAGRAM_HUMAN_AGENT_TAG'
          ? String(humanAgentTagFlag)
          : fallback,
      ),
    };
    summary = {
      summarize: jest.fn<any, any>().mockResolvedValue(undefined),
    };
    service = new InboxService(
      prisma,
      metaSender as unknown as MetaSenderService,
      inboxEvents as unknown as InboxEventsService,
      config as unknown as ConfigService,
      summary as unknown as ConversationSummaryService,
    );
  });

  describe('sendMessage', () => {
    it('son danışan mesajının üzerinden 24 saat geçtiyse 409 döner ve Meta’ya göndermez', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.message.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 25 * HOUR),
      });

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(metaSender.sendText).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('danışan hiç yazmamışsa pencereyi kapalı sayar', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('pencere açıkken bot aktifse konuşmayı devralır, gönderir ve AGENT mesajı kaydeder', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.message.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * HOUR),
      });
      const createdAt = new Date();
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        content: 'Merhaba',
        senderType: 'AGENT',
        createdAt,
      });

      const result = await service.sendMessage(
        'conv-1',
        { content: 'Merhaba' },
        'admin-1',
      );

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { isBotActive: false, status: 'PENDING_AGENT' },
      });
      expect(metaSender.sendText).toHaveBeenCalledWith(
        'WHATSAPP',
        '905550001122',
        'Merhaba',
      );
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 'conv-1',
            senderType: 'AGENT',
            content: 'Merhaba',
            agentUserId: 'admin-1',
          }),
        }),
      );
      expect(result).toMatchObject({ id: 'msg-1', senderType: 'AGENT' });
      expect(inboxEvents.emit).toHaveBeenCalledWith(
        'message.created',
        expect.objectContaining({ conversationId: 'conv-1' }),
      );
      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
    });

    it('Instagram konuşmasında alıcı olarak instagramId kullanılır', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({
          channel: 'INSTAGRAM',
          isBotActive: false,
          contact: { id: 'contact-1', phone: null, instagramId: 'ig-99' },
        }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });
      prisma.message.create.mockResolvedValue({
        id: 'msg-2',
        createdAt: new Date(),
      });

      await service.sendMessage('conv-1', { content: 'Selam' }, 'admin-1');

      expect(metaSender.sendText).toHaveBeenCalledWith(
        'INSTAGRAM',
        'ig-99',
        'Selam',
      );
      expect(prisma.conversation.update).toHaveBeenCalledTimes(1);
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBotActive: false }),
        }),
      );
    });

    it('Meta gönderimi başarısızsa 502 döner ve mesaj kaydetmez', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ isBotActive: false }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });
      metaSender.sendText.mockResolvedValue({ ok: false });

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow(BadGatewayException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage kuralları', () => {
    it('kapalı konuşmaya 409 döner ve Meta’ya göndermez', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ status: 'CLOSED', isBotActive: false }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(metaSender.sendText).not.toHaveBeenCalled();
    });

    it('Instagram’da 1000 karakteri aşan mesaj 400 döner ve göndermez', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({
          channel: 'INSTAGRAM',
          isBotActive: false,
          contact: { id: 'contact-1', phone: null, instagramId: 'ig-99' },
        }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(
        service.sendMessage('conv-1', { content: 'a'.repeat(1001) }, 'admin-1'),
      ).rejects.toThrow(
        new BadRequestException(
          'Instagram mesajları en fazla 1000 karakter olabilir.',
        ),
      );
      expect(metaSender.sendText).not.toHaveBeenCalled();
    });

    it('Instagram’da tam 1000 karakterlik mesajı kabul eder', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({
          channel: 'INSTAGRAM',
          isBotActive: false,
          contact: { id: 'contact-1', phone: null, instagramId: 'ig-99' },
        }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });
      prisma.message.create.mockResolvedValue({ id: 'msg-3' });

      await service.sendMessage(
        'conv-1',
        { content: 'a'.repeat(1000) },
        'admin-1',
      );

      expect(metaSender.sendText).toHaveBeenCalled();
    });

    it('WhatsApp’ta uzunluk sınırı uygulanmaz', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });
      prisma.message.create.mockResolvedValue({ id: 'msg-4' });

      await service.sendMessage(
        'conv-1',
        { content: 'a'.repeat(1001) },
        'admin-1',
      );

      expect(metaSender.sendText).toHaveBeenCalled();
    });

    it('Meta’nın döndürdüğü messageId’yi AGENT mesajına metaMessageId olarak kaydeder', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });
      metaSender.sendText.mockResolvedValue({ ok: true, messageId: 'wamid-7' });
      prisma.message.create.mockResolvedValue({ id: 'msg-5' });

      await service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1');

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metaMessageId: 'wamid-7' }),
        }),
      );
    });
  });

  describe('updateContact', () => {
    it('WhatsApp kişisinin telefonu değişirse 400 döner', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        channel: 'WHATSAPP',
        phone: '905550001122',
      });

      await expect(
        service.updateContact('contact-1', { phone: '905559998877' }),
      ).rejects.toThrow(
        new BadRequestException(
          'WhatsApp numarası değiştirilemez; bu numara mesaj adresidir.',
        ),
      );
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('WhatsApp kişisinde aynı telefon gelirse hata vermez', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        channel: 'WHATSAPP',
        phone: '905550001122',
      });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });

      await service.updateContact('contact-1', {
        phone: '905550001122',
        fullName: 'Ayşe',
      });

      expect(prisma.contact.update).toHaveBeenCalled();
    });

    it('Instagram kişisinin telefonu düzenlenebilir kalır', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'contact-2',
        channel: 'INSTAGRAM',
        phone: null,
      });
      prisma.contact.update.mockResolvedValue({ id: 'contact-2' });

      await service.updateContact('contact-2', { phone: '905551112233' });

      expect(prisma.contact.update).toHaveBeenCalled();
    });

    it('kişi yoksa 404 döner', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);

      await expect(
        service.updateContact('missing', { fullName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('handback', () => {
    it('kriz işaretli konuşmayı bota geri vermeye çalışınca 409 döner', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ flaggedCrisis: true, isBotActive: false }),
      );

      await expect(service.handback('conv-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('normal konuşmayı bota geri verir ve OPEN yapar', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ isBotActive: false }),
      );
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await service.handback('conv-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { isBotActive: true, status: 'OPEN' },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('conversation.updated', {
        conversationId: 'conv-1',
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
    });
  });

  describe('takeover and close', () => {
    it('devralma bot’u kapatır ve PENDING_AGENT yapar', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await service.takeover('conv-1', 'admin-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: {
          isBotActive: false,
          status: 'PENDING_AGENT',
          assignedUserId: 'admin-1',
          assignedAt: expect.any(Date),
        },
      });
    });

    it('kapatma konuşmayı CLOSED yapar ve bot’u kapatır', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await service.close('conv-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { isBotActive: false, status: 'CLOSED' },
      });
    });
  });

  describe('getCounts', () => {
    it('sidebar rozetlerini mevcut alanlarla ve attention ile döner', async () => {
      prisma.conversation.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      prisma.lead.count.mockResolvedValue(3);
      prisma.unansweredQuestion.count.mockResolvedValue(5);
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: 6 }])
        .mockResolvedValueOnce([{ count: 7 }]);

      const counts = await service.getCounts('admin-1');

      expect(counts).toEqual({
        open: 4,
        pendingAgent: 2,
        crisis: 1,
        attention: 3,
        newLeads: 3,
        openUnanswered: 5,
        needsReply: 6,
        unreadForMe: 7,
      });
      expect(prisma.conversation.count).toHaveBeenCalledWith({
        where: { flaggedCrisis: true, status: { not: 'CLOSED' } },
      });
    });

    it('attention, PENDING_AGENT sayısı ile açık kriz konuşmalarının toplamıdır', async () => {
      prisma.conversation.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2);

      const counts = await service.getCounts('admin-1');

      expect(counts.attention).toBe(9);
      expect(prisma.conversation.count).toHaveBeenCalledWith({
        where: { flaggedCrisis: true, status: 'OPEN' },
      });
    });
  });

  describe('listConversations filtreleri', () => {
    it('contactType filtresini kişi koşuluna ekler', async () => {
      await service.listConversations(
        { contactType: 'UZMAN' } as any,
        'admin-1',
      );

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contact: { contactType: 'UZMAN' } },
        }),
      );
    });

    it('contactType ve arama metnini ayrı koşullarda birleştirir', async () => {
      await service.listConversations(
        {
          contactType: 'EKIP',
          q: 'Ayşe',
        } as any,
        'admin-1',
      );

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            contact: { contactType: 'EKIP' },
            OR: [
              {
                contact: {
                  OR: [
                    { fullName: { contains: 'Ayşe', mode: 'insensitive' } },
                    { phone: { contains: 'Ayşe' } },
                    { instagramId: { contains: 'Ayşe' } },
                  ],
                },
              },
              {
                messages: {
                  some: {
                    isDraft: false,
                    content: { contains: 'Ayşe', mode: 'insensitive' },
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it('liste yanıtında contactType ve son mesajın isDraft alanını seçer', async () => {
      await service.listConversations({}, 'admin-1');

      const args = prisma.conversation.findMany.mock.calls[0][0];
      expect(args.include.contact.select).toMatchObject({ contactType: true });
      expect(args.include.messages.select).toMatchObject({ isDraft: true });
    });
  });

  describe('getConversation pencere bilgisi', () => {
    it('son danışan mesajından 24 saat sonrasını windowExpiresAt olarak döner', async () => {
      const lastAt = new Date(Date.now() - 2 * HOUR);
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ contact: { id: 'contact-1', contactType: 'DANISAN' } }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: lastAt });

      const result = await service.getConversation('conv-1');

      expect(result.windowOpen).toBe(true);
      expect(result.windowExpiresAt).toBe(
        new Date(lastAt.getTime() + 24 * HOUR).toISOString(),
      );
    });

    it('saati geçmiş ama işaretlenmemiş randevuları da (son 30 gün) getirir', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.message.findFirst.mockResolvedValue(null);

      await service.getConversation('conv-1');

      const args = prisma.appointment.findMany.mock.calls[0][0];
      expect(args.where.status).toBe('SCHEDULED');
      const from = (args.where.scheduledAt.gte as Date).getTime();
      expect(Date.now() - from).toBeGreaterThan(29 * 24 * HOUR);
      expect(Date.now() - from).toBeLessThan(31 * 24 * HOUR);
      expect(args.take).toBe(10);
    });

    it('danışan hiç yazmamışsa windowExpiresAt null döner', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.message.findFirst.mockResolvedValue(null);

      const result = await service.getConversation('conv-1');

      expect(result.windowOpen).toBe(false);
      expect(result.windowExpiresAt).toBeNull();
    });

    it('bayrak açıkken Instagram için windowExpiresAt 7 gün sonrasıdır', async () => {
      withHumanAgentTag(true);
      const lastAt = new Date(Date.now() - 3 * 24 * HOUR);
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({
          channel: 'INSTAGRAM',
          contact: { id: 'contact-1', phone: null, instagramId: 'ig-99' },
        }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: lastAt });

      const result = await service.getConversation('conv-1');

      expect(result.windowOpen).toBe(true);
      expect(result.windowExpiresAt).toBe(
        new Date(lastAt.getTime() + 7 * 24 * HOUR).toISOString(),
      );
    });
  });

  describe('updateContact contactType', () => {
    it('contactType değişince konuşmaya dokunmaz', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        channel: 'WHATSAPP',
        phone: '905550001122',
      });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });

      await service.updateContact('contact-1', { contactType: 'DANISAN' });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { contactType: 'DANISAN' },
      });
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(inboxEvents.emit).not.toHaveBeenCalled();
    });
  });

  describe('Instagram HUMAN_AGENT etiketi', () => {
    const instagram = () =>
      conversation({
        channel: 'INSTAGRAM',
        isBotActive: false,
        contact: { id: 'contact-1', phone: null, instagramId: 'ig-99' },
      });

    it('bayrak kapalıyken 3 gün önceki danışan mesajına gönderim 409 döner', async () => {
      prisma.conversation.findUnique.mockResolvedValue(instagram());
      prisma.message.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 3 * 24 * HOUR),
      });

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(metaSender.sendText).not.toHaveBeenCalled();
    });

    it('bayrak açıkken 24 saati geçen ama 7 günü geçmeyen pencerede HUMAN_AGENT etiketiyle gönderir', async () => {
      withHumanAgentTag(true);
      prisma.conversation.findUnique.mockResolvedValue(instagram());
      prisma.message.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 3 * 24 * HOUR),
      });
      prisma.message.create.mockResolvedValue({ id: 'msg-tag' });

      await service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1');

      expect(metaSender.sendText).toHaveBeenCalledWith(
        'INSTAGRAM',
        'ig-99',
        'Merhaba',
        { tag: 'HUMAN_AGENT' },
      );
      expect(prisma.message.create).toHaveBeenCalled();
    });

    it('bayrak açıkken 24 saat içindeki mesajda etiket eklemez', async () => {
      withHumanAgentTag(true);
      prisma.conversation.findUnique.mockResolvedValue(instagram());
      prisma.message.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * HOUR),
      });
      prisma.message.create.mockResolvedValue({ id: 'msg-plain' });

      await service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1');

      expect(metaSender.sendText).toHaveBeenCalledWith(
        'INSTAGRAM',
        'ig-99',
        'Merhaba',
      );
    });

    it('bayrak açıkken 7 günü geçen pencerede 409 döner ve göndermez', async () => {
      withHumanAgentTag(true);
      prisma.conversation.findUnique.mockResolvedValue(instagram());
      prisma.message.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 8 * 24 * HOUR),
      });

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(metaSender.sendText).not.toHaveBeenCalled();
    });

    it('bayrak açık olsa da WhatsApp 24 saat penceresinde kalır', async () => {
      withHumanAgentTag(true);
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.message.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 3 * 24 * HOUR),
      });

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(metaSender.sendText).not.toHaveBeenCalled();
    });
  });

  describe('konuşma atama (D1)', () => {
    it('atamayı kaldırır (null) ve conversation.updated yayar', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());

      await service.assignConversation('conv-1', null);

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { assignedUserId: null, assignedAt: null },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('conversation.updated', {
        conversationId: 'conv-1',
      });
    });

    it('ADMIN olmayan hedef kullanıcıya atamayı 400 ile reddeder', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.user.findUnique.mockResolvedValue({
        role: 'UZMAN',
        isActive: true,
      });

      await expect(
        service.assignConversation('conv-1', 'user-2'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('ADMIN kullanıcıya atar ve assignedAt yazar', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      prisma.user.findUnique.mockResolvedValue({
        role: 'ADMIN',
        isActive: true,
      });

      await service.assignConversation('conv-1', 'admin-2');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { assignedUserId: 'admin-2', assignedAt: expect.any(Date) },
      });
    });

    it('atanmamış konuşmayı devralan personele atar', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ assignedUserId: null }),
      );

      await service.takeover('conv-1', 'admin-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedUserId: 'admin-1' }),
        }),
      );
    });

    it('başkasına atanmış konuşmayı devralınca atamayı değiştirmez', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ assignedUserId: 'admin-9' }),
      );

      await service.takeover('conv-1', 'admin-1');

      const data = prisma.conversation.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('assignedUserId');
    });

    it('başka personele atanmış konuşmaya mesaj 409 döner ve göndermez', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({
          assignedUserId: 'admin-9',
          assignedUser: {
            id: 'admin-9',
            firstName: 'Ayşe',
            lastName: 'Yılmaz',
          },
        }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow('Bu konuşma Ayşe Yılmaz üzerinde');
      expect(metaSender.sendText).not.toHaveBeenCalled();
    });

    it('force true ile başka personele atanmış konuşmaya mesaj gönderir', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({
          isBotActive: false,
          assignedUserId: 'admin-9',
          assignedUser: {
            id: 'admin-9',
            firstName: 'Ayşe',
            lastName: 'Yılmaz',
          },
        }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });
      prisma.message.create.mockResolvedValue({
        id: 'msg-f',
        createdAt: new Date(),
      });

      await service.sendMessage(
        'conv-1',
        { content: 'Merhaba', force: true },
        'admin-1',
      );

      expect(metaSender.sendText).toHaveBeenCalled();
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { lastMessageAt: expect.any(Date) },
      });
    });

    it('atanmamış konuşmaya mesaj gönderen personel atanır', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ isBotActive: false, assignedUserId: null }),
      );
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });
      prisma.message.create.mockResolvedValue({
        id: 'msg-a',
        createdAt: new Date(),
      });

      await service.sendMessage('conv-1', { content: 'Selam' }, 'admin-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: {
          lastMessageAt: expect.any(Date),
          assignedUserId: 'admin-1',
          assignedAt: expect.any(Date),
        },
      });
    });

    it('assigned=me ve assigned=unassigned filtrelerini where koşuluna ekler', async () => {
      await service.listConversations({ assigned: 'me' } as any, 'admin-1');
      expect(prisma.conversation.findMany.mock.calls[0][0].where).toEqual({
        assignedUserId: 'admin-1',
      });

      await service.listConversations(
        { assigned: 'unassigned' } as any,
        'admin-1',
      );
      expect(prisma.conversation.findMany.mock.calls[1][0].where).toEqual({
        assignedUserId: null,
      });
    });
  });

  describe('danışan durumu ve etiketler (D2)', () => {
    it('lifecycleStatus alanını günceller', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        channel: 'WHATSAPP',
        phone: '905550001122',
      });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });

      await service.updateContact('contact-1', {
        lifecycleStatus: 'PASIF',
      } as any);

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { lifecycleStatus: 'PASIF' },
      });
    });

    it('tagIds gönderilirse etiketleri bu listeyle değiştirir (tekrarları ayıklar)', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        channel: 'INSTAGRAM',
        phone: null,
      });
      prisma.contactTag.count.mockResolvedValue(2);
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });

      await service.updateContact('contact-1', {
        tagIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '11111111-1111-4111-8111-111111111111',
        ],
      });

      expect(prisma.contactTag.count).toHaveBeenCalledWith({
        where: {
          id: {
            in: [
              '11111111-1111-4111-8111-111111111111',
              '22222222-2222-4222-8222-222222222222',
            ],
          },
        },
      });
      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: {
          tags: {
            set: [
              { id: '11111111-1111-4111-8111-111111111111' },
              { id: '22222222-2222-4222-8222-222222222222' },
            ],
          },
        },
      });
    });

    it('tagIds boş dizi ise tüm etiketleri kaldırır', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        channel: 'INSTAGRAM',
        phone: null,
      });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });

      await service.updateContact('contact-1', { tagIds: [] });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { tags: { set: [] } },
      });
    });

    it('olmayan etiket id’si varsa 400 döner ve kişiyi değiştirmez', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'contact-1',
        channel: 'INSTAGRAM',
        phone: null,
      });
      prisma.contactTag.count.mockResolvedValue(1);

      await expect(
        service.updateContact('contact-1', {
          tagIds: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('lifecycleStatus ve etiket filtrelerini kişi koşuluna ekler', async () => {
      await service.listConversations(
        {
          lifecycleStatus: 'DANISAN',
          tagId: '11111111-1111-4111-8111-111111111111',
        } as any,
        'admin-1',
      );

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            contact: {
              lifecycleStatus: 'DANISAN',
              tags: { some: { id: '11111111-1111-4111-8111-111111111111' } },
            },
          },
        }),
      );
    });
  });

  describe('okunmadı ve cevap bekliyor (D3)', () => {
    it('okundu işaretleme kaydı upsert eder', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());

      await service.markRead('conv-1', 'admin-1');

      expect(prisma.conversationRead.upsert).toHaveBeenCalledWith({
        where: {
          userId_conversationId: {
            userId: 'admin-1',
            conversationId: 'conv-1',
          },
        },
        create: {
          userId: 'admin-1',
          conversationId: 'conv-1',
          lastReadAt: expect.any(Date),
        },
        update: { lastReadAt: expect.any(Date) },
      });
    });

    it('okuma kaydı yoksa veya eskiyse unread true, güncelse false', async () => {
      const older = new Date(1_000);
      const newer = new Date(3_000);
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'c-none',
          lastMessageAt: newer,
          messages: [],
          contact: {},
          assignedUser: null,
        },
        {
          id: 'c-old',
          lastMessageAt: newer,
          messages: [],
          contact: {},
          assignedUser: null,
        },
        {
          id: 'c-ok',
          lastMessageAt: older,
          messages: [],
          contact: {},
          assignedUser: null,
        },
      ]);
      prisma.conversation.count.mockResolvedValue(3);
      prisma.conversationRead.findMany.mockResolvedValue([
        { conversationId: 'c-old', lastReadAt: older },
        { conversationId: 'c-ok', lastReadAt: newer },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 'c-old' }]);

      const result = await service.listConversations({}, 'admin-1');

      const byId = Object.fromEntries(result.data.map((c: any) => [c.id, c]));
      expect(byId['c-none'].unread).toBe(true);
      expect(byId['c-old'].unread).toBe(true);
      expect(byId['c-ok'].unread).toBe(false);
      expect(byId['c-old'].needsReply).toBe(true);
      expect(byId['c-none'].needsReply).toBe(false);
    });

    it('needsReply=true filtresi cevap bekleyen konuşma kimliklerine göre daraltır', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 'c-1' }]);

      await service.listConversations({ needsReply: true }, 'admin-1');

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['c-1'] } },
        }),
      );
    });

    it('sayaçlar needsReply ve unreadForMe değerlerini de döner', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ count: 0 }]);
      const counts = await service.getCounts('admin-1');
      expect(counts).toMatchObject({ needsReply: 0, unreadForMe: 0 });
    });
  });

  describe('mesajlarda arama (D5)', () => {
    it('liste araması instagramId ve taslak olmayan mesaj içeriğinde de arar', async () => {
      await service.listConversations({ q: 'merhaba' }, 'admin-1');

      const where = prisma.conversation.findMany.mock.calls[0][0].where;
      expect(where.OR[0].contact.OR).toContainEqual({
        instagramId: { contains: 'merhaba' },
      });
      expect(where.OR[1]).toEqual({
        messages: {
          some: {
            isDraft: false,
            content: { contains: 'merhaba', mode: 'insensitive' },
          },
        },
      });
    });

    it('genel arama taslak olmayan mesajları en yeniden eskiye, en fazla 50 ile arar', async () => {
      prisma.message.findMany.mockResolvedValue([]);

      await service.searchMessages('Merhaba');

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDraft: false,
            content: { contains: 'Merhaba', mode: 'insensitive' },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      );
    });

    it('snippet eşleşmenin çevresinden ±60 karakter alır', async () => {
      const content = `${'a'.repeat(100)}Merhaba${'b'.repeat(100)}`;
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm-1',
          conversationId: 'conv-1',
          senderType: 'CLIENT',
          content,
          createdAt: new Date(),
          conversation: { contact: { fullName: 'Ali', channel: 'WHATSAPP' } },
        },
      ]);

      const [hit] = await service.searchMessages('merhaba');

      expect(hit.snippet).toHaveLength(7 + 60 + 60);
      expect(hit.snippet).toContain('Merhaba');
      expect(hit).toMatchObject({
        conversationId: 'conv-1',
        messageId: 'm-1',
        contact: { fullName: 'Ali', channel: 'WHATSAPP' },
      });
    });

    it('arama metnindeki regex karakterleri hata vermez', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'm-2',
          conversationId: 'conv-1',
          senderType: 'AGENT',
          content: 'x (a+ y',
          createdAt: new Date(),
          conversation: { contact: { fullName: null, channel: 'INSTAGRAM' } },
        },
      ]);

      const [hit] = await service.searchMessages('(a+');

      expect(hit.snippet).toContain('(a+');
    });
  });

  describe('özet (D9)', () => {
    it('konuşma kapatılınca özet üretimini tetikler', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());

      await service.close('conv-1');

      expect(summary.summarize).toHaveBeenCalledWith('conv-1');
    });

    it('özet hata verse de kapatma başarılı olur', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation());
      summary.summarize.mockRejectedValue(new Error('model yok'));

      await service.close('conv-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { isBotActive: false, status: 'CLOSED' },
      });
    });

    it('özeti siler (lastSummary ve lastSummaryAt null)', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({
        id: 'contact-1',
        lastSummary: null,
        lastSummaryAt: null,
      });

      await service.deleteContactSummary('contact-1');

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { lastSummary: null, lastSummaryAt: null },
        select: { id: true, lastSummary: true, lastSummaryAt: true },
      });
    });

    it('özet silmede kişi yoksa 404 döner', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);

      await expect(service.deleteContactSummary('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
