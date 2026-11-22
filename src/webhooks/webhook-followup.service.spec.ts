import {
  WebhookFollowupService,
  OPT_OUT_CONFIRMATION,
} from './webhook-followup.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { MetaSenderService } from './meta-sender.service';
import { AssistantSettingsService } from '../assistant/assistant-settings.service';

function buildPrismaMock() {
  return {
    contact: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    conversation: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    message: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn<any, any>()
        .mockResolvedValue({ id: 'bot-1', createdAt: new Date(0) }),
    },
    appointmentReminder: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    campaignRecipient: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    campaign: {
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('WebhookFollowupService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let events: { emit: jest.Mock };
  let meta: { sendText: jest.Mock };
  let settings: { getEffectiveMode: jest.Mock };
  let service: WebhookFollowupService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    events = { emit: jest.fn() };
    meta = {
      sendText: jest
        .fn<any, any>()
        .mockResolvedValue({ ok: true, messageId: 'wamid.confirm' }),
    };
    settings = { getEffectiveMode: jest.fn().mockResolvedValue('LIVE') };
    service = new WebhookFollowupService(
      prisma as unknown as PrismaService,
      events as unknown as InboxEventsService,
      meta as unknown as MetaSenderService,
      settings as unknown as AssistantSettingsService,
    );
  });

  describe('applyWhatsAppStatuses', () => {
    it('SENT -> DELIVERED ilerler, deliveredAt yazar ve olay yayınlar', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        deliveryStatus: 'SENT',
      });

      await service.applyWhatsAppStatuses([
        { id: 'wamid.1', status: 'delivered', timestamp: '1700000000' },
      ]);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', deliveryStatus: 'SENT' },
        data: {
          deliveryStatus: 'DELIVERED',
          deliveredAt: new Date(1700000000 * 1000),
        },
      });
      expect(events.emit).toHaveBeenCalledWith('message.updated', {
        conversationId: 'c1',
        messageId: 'm1',
        deliveryStatus: 'DELIVERED',
      });
    });

    it('READ gelen mesaj DELIVERED durumuna geri dönmez', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        deliveryStatus: 'READ',
      });

      await service.applyWhatsAppStatuses([
        { id: 'wamid.1', status: 'delivered' },
      ]);

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('failed hata başlığını ve kodunu deliveryError alanına yazar', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        deliveryStatus: null,
      });

      await service.applyWhatsAppStatuses([
        {
          id: 'wamid.1',
          status: 'failed',
          errors: [{ code: 131047, title: 'Yeniden deneme penceresi' }],
        },
      ]);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', deliveryStatus: null },
        data: {
          deliveryStatus: 'FAILED',
          deliveryError: 'Yeniden deneme penceresi (kod 131047)',
        },
      });
    });

    it('hatırlatma mesajı başarısız olursa hatırlatma kaydı FAILED olur', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await service.applyWhatsAppStatuses([
        { id: 'wamid.r1', status: 'failed', errors: [{ title: 'Hata' }] },
      ]);

      expect(prisma.appointmentReminder.updateMany).toHaveBeenCalledWith({
        where: {
          messageId: 'wamid.r1',
          status: { in: ['SENT', 'SENDING'] },
        },
        data: { status: 'FAILED', error: 'Hata' },
      });
    });

    it('kampanya alıcısı iletildiğinde durum ve sayaç alıcılardan yeniden hesaplanır', async () => {
      prisma.campaignRecipient.findMany.mockResolvedValue([
        { id: 'r1', campaignId: 'camp-1', status: 'SENT' },
      ]);
      prisma.campaignRecipient.groupBy.mockResolvedValue([
        { status: 'DELIVERED', included: true, _count: { _all: 1 } },
      ]);

      await service.applyWhatsAppStatuses([
        { id: 'wamid.k1', status: 'delivered' },
      ]);

      expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'SENT' },
        data: { status: 'DELIVERED' },
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: expect.objectContaining({
          sentCount: 1,
          deliveredCount: 1,
          readCount: 0,
        }),
      });
    });

    it('zaten ilerisi olan alıcı için sayaç yeniden hesaplanmaz', async () => {
      prisma.campaignRecipient.findMany.mockResolvedValue([
        { id: 'r1', campaignId: 'camp-1', status: 'READ' },
      ]);

      await service.applyWhatsAppStatuses([
        { id: 'wamid.k1', status: 'delivered' },
      ]);

      expect(prisma.campaignRecipient.updateMany).not.toHaveBeenCalled();
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('mesaj kaydı henüz yoksa durum kısa süre sonra bir kez daha uygulanır', async () => {
      jest.useFakeTimers();
      try {
        prisma.message.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'm-late',
            conversationId: 'c-late',
            deliveryStatus: 'SENT',
          });

        await service.applyWhatsAppStatuses([
          { id: 'wamid.late', status: 'delivered' },
        ]);
        expect(prisma.message.updateMany).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(3000);

        expect(prisma.message.updateMany).toHaveBeenCalledWith({
          where: { id: 'm-late', deliveryStatus: 'SENT' },
          data: expect.objectContaining({ deliveryStatus: 'DELIVERED' }),
        });
        expect(prisma.message.findUnique).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('kampanya alıcısı kaydı sonradan yazılırsa durum gecikmeli uygulanır', async () => {
      jest.useFakeTimers();
      try {
        prisma.campaignRecipient.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { id: 'r-late', campaignId: 'camp-late', status: 'SENT' },
          ]);

        await service.applyWhatsAppStatuses([
          { id: 'wamid.camp', status: 'delivered' },
        ]);
        expect(prisma.campaignRecipient.updateMany).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(3000);

        expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
          where: { id: 'r-late', status: 'SENT' },
          data: { status: 'DELIVERED' },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('hatırlatma kaydı sonradan yazılırsa FAILED durumu gecikmeli uygulanır', async () => {
      jest.useFakeTimers();
      try {
        prisma.appointmentReminder.updateMany
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 });

        await service.applyWhatsAppStatuses([
          { id: 'wamid.rem', status: 'failed', errors: [{ title: 'Hata' }] },
        ]);
        await jest.advanceTimersByTimeAsync(3000);

        expect(prisma.appointmentReminder.updateMany).toHaveBeenCalledTimes(2);
        expect(prisma.appointmentReminder.updateMany).toHaveBeenLastCalledWith({
          where: {
            messageId: 'wamid.rem',
            status: { in: ['SENT', 'SENDING'] },
          },
          data: { status: 'FAILED', error: 'Hata' },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('bilinmeyen durum ve mesaj kimliği olmayan olay yok sayılır', async () => {
      await service.applyWhatsAppStatuses([
        { id: 'wamid.1', status: 'bilinmeyen' },
        { id: '', status: 'sent' },
      ]);

      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('handleInboundMessage (DUR ve REPLIED)', () => {
    const base = {
      conversationId: 'c1',
      kind: 'text' as const,
      senderId: '905550000000',
      standby: false,
    };

    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue({
        contactId: 'contact-1',
        channel: 'WHATSAPP',
      });
    });

    it('DUR: kişiyi kapatır, bekleyenleri iptal eder, onay gönderir ve true döner', async () => {
      prisma.campaignRecipient.findMany
        .mockResolvedValueOnce([]) // markReplied
        .mockResolvedValueOnce([{ id: 'r9', campaignId: 'camp-2' }]); // PENDING
      prisma.campaignRecipient.groupBy.mockResolvedValue([
        { status: 'SKIPPED', included: true, _count: { _all: 1 } },
      ]);

      const optOut = await service.handleInboundMessage({
        ...base,
        text: 'DUR!',
      });

      expect(optOut).toBe(true);
      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: expect.objectContaining({
          reminderOptOut: true,
          marketingOptOut: true,
          optOutAt: expect.any(Date),
        }),
      });
      expect(prisma.appointmentReminder.updateMany).toHaveBeenCalledWith({
        where: { status: 'PENDING', appointment: { contactId: 'contact-1' } },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: { id: 'r9', status: 'PENDING' },
        data: { status: 'SKIPPED', skipReason: 'opt_out' },
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-2' },
        data: expect.objectContaining({ skippedCount: 1 }),
      });
      expect(meta.sendText).toHaveBeenCalledWith(
        'WHATSAPP',
        '905550000000',
        OPT_OUT_CONFIRMATION,
      );
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          senderType: 'BOT',
          content: OPT_OUT_CONFIRMATION,
          metaMessageId: 'wamid.confirm',
          deliveryStatus: 'SENT',
        }),
      });
    });

    it('standby kopyasında DUR kişiyi kapatır ama onay göndermez', async () => {
      const optOut = await service.handleInboundMessage({
        ...base,
        text: 'stop',
        standby: true,
      });

      expect(optOut).toBe(true);
      expect(prisma.contact.update).toHaveBeenCalled();
      expect(meta.sendText).not.toHaveBeenCalled();
    });

    it.each(['SHADOW', 'OFF'])(
      '%s modunda DUR kaydedilir ama onay gönderilmez (numarayı başka sistem yönetiyor olabilir)',
      async (mode) => {
        settings.getEffectiveMode.mockResolvedValue(mode);

        const optOut = await service.handleInboundMessage({
          ...base,
          text: 'DUR',
        });

        expect(optOut).toBe(true);
        expect(prisma.contact.update).toHaveBeenCalled();
        expect(meta.sendText).not.toHaveBeenCalled();
        expect(prisma.message.create).not.toHaveBeenCalled();
      },
    );

    it('mod okunamazsa onay gönderilmez', async () => {
      settings.getEffectiveMode.mockRejectedValue(new Error('db'));

      const optOut = await service.handleInboundMessage({
        ...base,
        text: 'DUR',
      });

      expect(optOut).toBe(true);
      expect(meta.sendText).not.toHaveBeenCalled();
    });

    it('normal metinde opt-out uygulanmaz ve false döner', async () => {
      const optOut = await service.handleInboundMessage({
        ...base,
        text: 'Merhaba, randevu almak istiyorum',
      });

      expect(optOut).toBe(false);
      expect(prisma.contact.update).not.toHaveBeenCalled();
      expect(meta.sendText).not.toHaveBeenCalled();
    });

    it('unsupported tipte DUR metni yok sayılır', async () => {
      const optOut = await service.handleInboundMessage({
        ...base,
        kind: 'unsupported',
        text: 'dur',
      });

      expect(optOut).toBe(false);
    });

    it('72 saat içinde iletilmiş kampanya alıcısı REPLIED olur', async () => {
      prisma.campaignRecipient.findMany.mockResolvedValueOnce([
        { id: 'r2', campaignId: 'camp-3' },
      ]);
      prisma.campaignRecipient.groupBy.mockResolvedValue([
        { status: 'REPLIED', included: true, _count: { _all: 1 } },
      ]);

      const optOut = await service.handleInboundMessage({
        ...base,
        text: 'Merhaba',
      });

      expect(optOut).toBe(false);
      const call = prisma.campaignRecipient.findMany.mock.calls[0][0];
      expect(call.where.contactId).toBe('contact-1');
      expect(call.where.status).toEqual({ in: ['SENT', 'DELIVERED', 'READ'] });
      const windowMs = Date.now() - call.where.sentAt.gte.getTime();
      expect(windowMs).toBeGreaterThanOrEqual(72 * 60 * 60 * 1000);
      expect(windowMs).toBeLessThan(72 * 60 * 60 * 1000 + 60_000);
      expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: { id: 'r2', status: { in: ['SENT', 'DELIVERED', 'READ'] } },
        data: { status: 'REPLIED' },
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-3' },
        data: expect.objectContaining({ repliedCount: 1, sentCount: 1 }),
      });
    });

    it('Instagram yanıtı kampanya alıcısını REPLIED yapmaz', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        contactId: 'contact-1',
        channel: 'INSTAGRAM',
      });

      await service.handleInboundMessage({ ...base, text: 'Merhaba' });

      expect(prisma.campaignRecipient.findMany).not.toHaveBeenCalled();
    });

    it('takip hatası yutulur ve DUR yine de true döner (asistan cevap vermez)', async () => {
      prisma.contact.update.mockRejectedValue(new Error('db'));

      const optOut = await service.handleInboundMessage({
        ...base,
        text: 'DUR',
      });

      expect(optOut).toBe(true);
    });
  });

  describe('applyInstagramRead', () => {
    it('okunma anına kadar giden personel ve bot mesajlarını READ yapar', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-ig' });
      prisma.conversation.findMany.mockResolvedValue([{ id: 'c-ig' }]);
      prisma.message.findMany.mockResolvedValue([
        { id: 'm-a', conversationId: 'c-ig' },
        { id: 'm-b', conversationId: 'c-ig' },
      ]);

      await service.applyInstagramRead({
        sender: { id: 'igsid-1' },
        recipient: { id: 'page' },
        timestamp: 1700000000000,
        read: { watermark: 1700000000000 },
      });

      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { instagramId: 'igsid-1' },
        select: { id: true },
      });
      const findCall = prisma.message.findMany.mock.calls[0][0];
      expect(findCall.where.senderType).toEqual({ in: ['AGENT', 'BOT'] });
      expect(findCall.where.createdAt.lte).toEqual(new Date(1700000000000));
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['m-a', 'm-b'] },
          OR: expect.any(Array),
        },
        data: { deliveryStatus: 'READ', readAt: expect.any(Date) },
      });
      expect(events.emit).toHaveBeenCalledWith('message.updated', {
        conversationId: 'c-ig',
        messageId: 'm-a',
        deliveryStatus: 'READ',
      });
    });

    it('watermark yoksa okunan mesajın (mid) zamanını kullanır', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-ig' });
      prisma.conversation.findMany.mockResolvedValue([{ id: 'c-ig' }]);
      prisma.message.findUnique.mockResolvedValue({
        createdAt: new Date(1700000100000),
      });
      prisma.message.findMany.mockResolvedValue([]);

      await service.applyInstagramRead({
        sender: { id: 'igsid-1' },
        recipient: { id: 'page' },
        timestamp: 1700000900000,
        read: { mid: 'ig-mid-1' },
      });

      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { metaMessageId: 'ig-mid-1' },
        select: { createdAt: true },
      });
      const findCall = prisma.message.findMany.mock.calls[0][0];
      expect(findCall.where.createdAt.lte).toEqual(new Date(1700000100000));
    });

    it('watermark ve mid yoksa olay zamanına düşer', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-ig' });
      prisma.conversation.findMany.mockResolvedValue([{ id: 'c-ig' }]);
      prisma.message.findMany.mockResolvedValue([]);

      await service.applyInstagramRead({
        sender: { id: 'igsid-1' },
        recipient: { id: 'page' },
        timestamp: 1700000000000,
        read: {},
      });

      const findCall = prisma.message.findMany.mock.calls[0][0];
      expect(findCall.where.createdAt.lte).toEqual(new Date(1700000000000));
    });

    it('bilinmeyen danışan için hiçbir şey yapmaz', async () => {
      await service.applyInstagramRead({
        sender: { id: 'igsid-x' },
        recipient: { id: 'page' },
        timestamp: 1,
        read: { watermark: 1 },
      });

      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });
});
