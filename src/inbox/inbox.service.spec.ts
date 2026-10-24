import { BadGatewayException, ConflictException } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

const HOUR = 60 * 60 * 1000;

function buildPrismaMock() {
  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
      count: jest.fn<any, any>().mockResolvedValue(0),
    },
    message: {
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
      create: jest.fn<any, any>(),
    },
    lead: { count: jest.fn<any, any>().mockResolvedValue(0) },
    unansweredQuestion: { count: jest.fn<any, any>().mockResolvedValue(0) },
  };
  prisma.$transaction = jest.fn<any, any>((ops: Promise<unknown>[]) =>
    Promise.all(ops),
  );
  return prisma;
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
  let service: InboxService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    metaSender = { sendText: jest.fn<any, any>().mockResolvedValue(true) };
    inboxEvents = { emit: jest.fn<any, any>(), stream: jest.fn<any, any>() };
    service = new InboxService(
      prisma as unknown as PrismaService,
      metaSender as unknown as MetaSenderService,
      inboxEvents as unknown as InboxEventsService,
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
      prisma.message.create.mockResolvedValue({ id: 'msg-2', createdAt: new Date() });

      await service.sendMessage('conv-1', { content: 'Selam' }, 'admin-1');

      expect(metaSender.sendText).toHaveBeenCalledWith('INSTAGRAM', 'ig-99', 'Selam');
      expect(prisma.conversation.update).toHaveBeenCalledTimes(1);
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isBotActive: false }) }),
      );
    });

    it('Meta gönderimi başarısızsa 502 döner ve mesaj kaydetmez', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation({ isBotActive: false }));
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() });
      metaSender.sendText.mockResolvedValue(false);

      await expect(
        service.sendMessage('conv-1', { content: 'Merhaba' }, 'admin-1'),
      ).rejects.toThrow(BadGatewayException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('handback', () => {
    it('kriz işaretli konuşmayı bota geri vermeye çalışınca 409 döner', async () => {
      prisma.conversation.findUnique.mockResolvedValue(
        conversation({ flaggedCrisis: true, isBotActive: false }),
      );

      await expect(service.handback('conv-1')).rejects.toThrow(ConflictException);
      expect(prisma.conversation.update).not.toHaveBeenCalled();
    });

    it('normal konuşmayı bota geri verir ve OPEN yapar', async () => {
      prisma.conversation.findUnique.mockResolvedValue(conversation({ isBotActive: false }));
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

      await service.takeover('conv-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { isBotActive: false, status: 'PENDING_AGENT' },
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
    it('sidebar rozetlerini beş sayıyla döner', async () => {
      prisma.conversation.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
      prisma.lead.count.mockResolvedValue(3);
      prisma.unansweredQuestion.count.mockResolvedValue(5);

      const counts = await service.getCounts();

      expect(counts).toEqual({
        open: 4,
        pendingAgent: 2,
        crisis: 1,
        newLeads: 3,
        openUnanswered: 5,
      });
      expect(prisma.conversation.count).toHaveBeenCalledWith({
        where: { flaggedCrisis: true, status: { not: 'CLOSED' } },
      });
    });
  });
});
