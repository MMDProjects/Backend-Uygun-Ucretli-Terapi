import { HandoffService, REASON_LABELS } from './handoff.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { CrisisAlertService } from './crisis-alert.service';

const CONTACT_SELECT = {
  contact: { select: { fullName: true, phone: true, instagramId: true } },
};

function buildPrismaMock() {
  return {
    conversation: {
      update: jest
        .fn<any, any>()
        .mockResolvedValue({ contact: { fullName: 'Ayşe Yılmaz' } }),
    },
  };
}

describe('HandoffService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let notifications: { notifyAdmins: jest.Mock };
  let service: HandoffService;
  let inboxEvents: { emit: jest.Mock };
  let crisisAlert: { alert: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    notifications = {
      notifyAdmins: jest.fn<any, any>().mockResolvedValue(undefined),
    };
    inboxEvents = { emit: jest.fn<any, any>() };
    crisisAlert = { alert: jest.fn<any, any>().mockResolvedValue(undefined) };
    service = new HandoffService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      inboxEvents as unknown as InboxEventsService,
      crisisAlert as unknown as CrisisAlertService,
    );
  });

  it('normal devirde botu kapatır, PENDING_AGENT yapar ve WARNING gönderir', async () => {
    await service.handoff('conv-1', 'paket_sorusu', 'Paket fiyatı soruyor');

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: expect.objectContaining({
        isBotActive: false,
        status: 'PENDING_AGENT',
      }),
      include: CONTACT_SELECT,
    });
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    const [type, message] = notifications.notifyAdmins.mock.calls[0];
    expect(type).toBe('WARNING');
    expect(message).toContain(REASON_LABELS.paket_sorusu);
    expect(message).toContain('Ayşe Yılmaz');
    expect(message).toContain('Paket fiyatı soruyor');
  });

  it('devir sebebi, özeti ve zamanı konuşmaya kaydeder', async () => {
    await service.handoff('conv-5', 'sikayet', '  Şikayet var  ');

    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data.handoffReason).toBe('sikayet');
    expect(data.handoffSummary).toBe('Şikayet var');
    expect(data.handedOffAt).toBeInstanceOf(Date);
  });

  it('boş özeti null olarak kaydeder ve bildirimde özet eklemez', async () => {
    await service.handoff('conv-6', 'yetkili_talebi', '   ');

    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data.handoffSummary).toBeNull();
    const [, message] = notifications.notifyAdmins.mock.calls[0];
    expect(message).toBe(
      `Asistan devri (${REASON_LABELS.yetkili_talebi}): Ayşe Yılmaz`,
    );
  });

  it('özeti en fazla 1000 karakter kaydeder ve bildirimde 120 karakterle sınırlar', async () => {
    const longSummary = 'a'.repeat(1500);
    await service.handoff('conv-7', 'konum_idari', longSummary);

    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data.handoffSummary).toHaveLength(1000);
    const [, message] = notifications.notifyAdmins.mock.calls[0];
    expect(message.endsWith('a'.repeat(120))).toBe(true);
    expect(message).not.toContain('a'.repeat(121));
  });

  it('kişi adı yoksa telefon, o da yoksa instagramId gösterir', async () => {
    prisma.conversation.update.mockResolvedValueOnce({
      contact: { fullName: null, phone: null, instagramId: 'ig-123' },
    });
    await service.handoff('conv-8', 'sikayet', 'özet');

    const [, message] = notifications.notifyAdmins.mock.calls[0];
    expect(message).toContain('ig-123');
  });

  it('acil_durum devrinde flaggedCrisis=true yazar ve DANGER_PANIC gönderir', async () => {
    await service.handoff('conv-2', 'acil_durum', 'Kriz özeti');

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-2' },
      data: expect.objectContaining({
        isBotActive: false,
        status: 'PENDING_AGENT',
        flaggedCrisis: true,
      }),
      include: CONTACT_SELECT,
    });
    const [type, message] = notifications.notifyAdmins.mock.calls[0];
    expect(type).toBe('DANGER_PANIC');
    expect(message).toContain(REASON_LABELS.acil_durum);
  });

  it('devirde inbox’a conversation.updated ve counts.changed yayınlar', async () => {
    await service.handoff('conv-4', 'sikayet', 'özet');

    expect(inboxEvents.emit).toHaveBeenCalledWith('conversation.updated', {
      conversationId: 'conv-4',
    });
    expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
  });

  it('acil olmayan devirde flaggedCrisis alanı yazılmaz', async () => {
    await service.handoff('conv-3', 'sikayet', 'özet');

    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('flaggedCrisis');
  });

  it('acil_durum devrinde kriz e-postası için CrisisAlertService çağrılır', async () => {
    await service.handoff('conv-7', 'acil_durum', 'Kriz özeti');

    expect(crisisAlert.alert).toHaveBeenCalledWith('conv-7', 'handoff');
  });

  it('acil olmayan devirde kriz e-postası gönderilmez', async () => {
    await service.handoff('conv-8', 'sikayet', 'Şikayet');

    expect(crisisAlert.alert).not.toHaveBeenCalled();
  });

  it('uzman_ekip devrini doğru etiketle bildirir ve botu kapatır', async () => {
    await service.handoff(
      'conv-9',
      'uzman_ekip',
      'Uzman veya iç ekip mesajı — Elif cevap vermez',
    );

    expect(REASON_LABELS.uzman_ekip).toBe('Uzman / iç ekip');
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isBotActive: false,
          handoffReason: 'uzman_ekip',
        }),
      }),
    );
    expect(crisisAlert.alert).not.toHaveBeenCalled();
  });
});
