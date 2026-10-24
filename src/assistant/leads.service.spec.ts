import { LeadsService, LeadToolArgs } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

function buildPrismaMock() {
  return {
    lead: {
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
      create: jest.fn<any, any>().mockResolvedValue({ id: 'lead-1' }),
    },
    contact: {
      update: jest.fn<any, any>().mockResolvedValue({}),
    },
  };
}

const baseArgs: LeadToolArgs = {
  hizmet: 'bireysel',
  ad_soyad: 'Ayşe Yılmaz',
  yas: 31,
  arama_saati: 'yarın 14:00',
  ozet: 'GİZLİ ÖZET METNİ',
};

describe('LeadsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let notifications: { notifyAdmins: jest.Mock };
  let mail: { sendNewLeadAdmin: jest.Mock };
  let inboxEvents: { emit: jest.Mock };
  let service: LeadsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    notifications = {
      notifyAdmins: jest.fn<any, any>().mockResolvedValue(undefined),
    };
    mail = {
      sendNewLeadAdmin: jest.fn<any, any>().mockResolvedValue(undefined),
    };
    inboxEvents = { emit: jest.fn<any, any>() };
    service = new LeadsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      mail as unknown as MailService,
      inboxEvents as unknown as InboxEventsService,
    );
  });

  it("Instagram'da telefon yoksa kaydetmez ve ok=false döner", async () => {
    const result = await service.createFromTool(
      { id: 'conv-1', channel: 'INSTAGRAM' },
      { id: 'contact-1', phone: null },
      baseArgs,
    );

    expect(result.ok).toBe(false);
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it('aynı konuşmada son 10 dakikada lead varsa tekrar kaydetmez', async () => {
    prisma.lead.findFirst.mockResolvedValueOnce({ id: 'lead-old' });

    const result = await service.createFromTool(
      { id: 'conv-1', channel: 'WHATSAPP' },
      { id: 'contact-1', phone: '905551112233' },
      baseArgs,
    );

    expect(result.ok).toBe(false);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: 'conv-1' }),
      }),
    );
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('10 dakika penceresi son 10 dakikayı kapsayan bir tarih ile sorgulanır', async () => {
    const before = Date.now();
    await service.createFromTool(
      { id: 'conv-1', channel: 'WHATSAPP' },
      { id: 'contact-1', phone: '905551112233' },
      baseArgs,
    );
    const where = prisma.lead.findFirst.mock.calls[0][0].where;
    const since = (where.createdAt.gte as Date).getTime();
    expect(before - since).toBeGreaterThanOrEqual(10 * 60 * 1000 - 5);
    expect(before - since).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  it("Instagram'da telefon argümandan geldiyse Contact.phone yazılır ve lead oluşturulur", async () => {
    const result = await service.createFromTool(
      { id: 'conv-1', channel: 'INSTAGRAM' },
      { id: 'contact-1', phone: null },
      { ...baseArgs, telefon: '05551112233', hizmet: 'emdr' },
    );

    expect(result.ok).toBe(true);
    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contactId: 'contact-1',
        conversationId: 'conv-1',
        channel: 'INSTAGRAM',
        serviceType: 'EMDR',
        fullName: 'Ayşe Yılmaz',
        age: 31,
        phone: '05551112233',
        preferredCallTime: 'yarın 14:00',
        summary: 'GİZLİ ÖZET METNİ',
      }),
    });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { phone: '05551112233' },
    });
  });

  it('bildirim metni özet içermez ve INFO tipinde gönderilir', async () => {
    await service.createFromTool(
      { id: 'conv-1', channel: 'WHATSAPP' },
      { id: 'contact-1', phone: '905551112233' },
      baseArgs,
    );

    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    const [type, message] = notifications.notifyAdmins.mock.calls[0];
    expect(type).toBe('INFO');
    expect(message).toBe(
      'Yeni arama talebi: Ayşe Yılmaz, yarın 14:00, BIREYSEL',
    );
    expect(message).not.toContain('GİZLİ ÖZET METNİ');
  });

  it("WhatsApp'ta contact.phone varken Contact güncellenmez, admin e-postası gönderilir", async () => {
    const result = await service.createFromTool(
      { id: 'conv-1', channel: 'WHATSAPP' },
      { id: 'contact-1', phone: '905551112233' },
      baseArgs,
    );

    expect(result.ok).toBe(true);
    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(mail.sendNewLeadAdmin).toHaveBeenCalledWith({
      fullName: 'Ayşe Yılmaz',
      preferredCallTime: 'yarın 14:00',
      serviceType: 'BIREYSEL',
      channel: 'WHATSAPP',
    });
  });

  it('kayıt başarılıysa inbox’a counts.changed yayınlar', async () => {
    await service.createFromTool(
      { id: 'conv-1', channel: 'WHATSAPP' },
      { id: 'contact-1', phone: '905551112233' },
      baseArgs,
    );

    expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
  });

  it('geçersiz hizmet türünde kaydetmez', async () => {
    const result = await service.createFromTool(
      { id: 'conv-1', channel: 'WHATSAPP' },
      { id: 'contact-1', phone: '905551112233' },
      { ...baseArgs, hizmet: 'bilinmeyen' },
    );

    expect(result.ok).toBe(false);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });
});
