import { HandoffService } from './handoff.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

function buildPrismaMock() {
  return {
    conversation: {
      update: jest.fn<any, any>().mockResolvedValue({}),
    },
  };
}

describe('HandoffService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let notifications: { notifyAdmins: jest.Mock };
  let service: HandoffService;
  let inboxEvents: { emit: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    notifications = { notifyAdmins: jest.fn<any, any>().mockResolvedValue(undefined) };
    inboxEvents = { emit: jest.fn<any, any>() };
    service = new HandoffService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      inboxEvents as unknown as InboxEventsService,
    );
  });

  it('normal devirde botu kapatır, PENDING_AGENT yapar ve WARNING gönderir', async () => {
    await service.handoff('conv-1', 'paket_sorusu', 'GİZLİ ÖZET');

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { isBotActive: false, status: 'PENDING_AGENT' },
    });
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    const [type, message] = notifications.notifyAdmins.mock.calls[0];
    expect(type).toBe('WARNING');
    expect(message).toContain('paket_sorusu');
    expect(message).not.toContain('GİZLİ ÖZET');
  });

  it('acil_durum devrinde flaggedCrisis=true yazar ve DANGER_PANIC gönderir', async () => {
    await service.handoff('conv-2', 'acil_durum', 'Kriz özeti');

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-2' },
      data: {
        isBotActive: false,
        status: 'PENDING_AGENT',
        flaggedCrisis: true,
      },
    });
    const [type, message] = notifications.notifyAdmins.mock.calls[0];
    expect(type).toBe('DANGER_PANIC');
    expect(message).toContain('acil_durum');
    expect(message).not.toContain('Kriz özeti');
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
});
