import { NotificationType, TemplateStatus } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TemplateStatusHandler } from './template-status.handler';

function build(
  found: { id: string; name: string } | null = { id: 't1', name: 'randevu' },
) {
  const prisma = {
    whatsAppTemplate: {
      findUnique: jest.fn().mockResolvedValue(found),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const notifications = {
    notifyAdmins: jest.fn().mockResolvedValue(undefined),
  };
  const handler = new TemplateStatusHandler(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { handler, prisma, notifications };
}

describe('TemplateStatusHandler', () => {
  it('APPROVED olayında durumu günceller ve uyarı göndermez', async () => {
    const { handler, prisma, notifications } = build();

    await handler.handle({
      event: 'APPROVED',
      message_template_id: 555,
      message_template_name: 'randevu',
      message_template_language: 'tr',
      reason: 'NONE',
    });

    expect(prisma.whatsAppTemplate.findUnique).toHaveBeenCalledWith({
      where: { metaId: '555' },
      select: { id: true, name: true },
    });
    expect(prisma.whatsAppTemplate.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: TemplateStatus.APPROVED, rejectedReason: null },
    });
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it('REJECTED olayında ret sebebini kaydeder ve yöneticilere uyarı gönderir', async () => {
    const { handler, prisma, notifications } = build();

    await handler.handle({
      event: 'REJECTED',
      message_template_id: 555,
      reason: 'INVALID_FORMAT',
    });

    expect(prisma.whatsAppTemplate.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: {
        status: TemplateStatus.REJECTED,
        rejectedReason: 'INVALID_FORMAT',
      },
    });
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      NotificationType.WARNING,
      expect.stringContaining('REJECTED'),
    );
  });

  it('PAUSED olayında yöneticilere uyarı gönderir', async () => {
    const { handler, notifications } = build();

    await handler.handle({ event: 'PAUSED', message_template_id: 555 });

    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      NotificationType.WARNING,
      expect.stringContaining('PAUSED'),
    );
  });

  it('Meta kimliği bulunamazsa ad ve dil ile arar', async () => {
    const { handler, prisma } = build(null);
    prisma.whatsAppTemplate.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 't2', name: 'randevu' });

    await handler.handle({
      event: 'APPROVED',
      message_template_id: 999,
      message_template_name: 'randevu',
      message_template_language: 'tr',
    });

    expect(prisma.whatsAppTemplate.findUnique).toHaveBeenLastCalledWith({
      where: {
        name_language: { name: 'randevu', language: 'tr' },
      },
      select: { id: true, name: true },
    });
    expect(prisma.whatsAppTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't2' } }),
    );
  });

  it('tanınmayan olayı yok sayar', async () => {
    const { handler, prisma, notifications } = build();

    await handler.handle({ event: 'FLAGGED', message_template_id: 555 });

    expect(prisma.whatsAppTemplate.findUnique).not.toHaveBeenCalled();
    expect(prisma.whatsAppTemplate.update).not.toHaveBeenCalled();
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it('kayıt bulunamazsa hata fırlatmaz ve güncelleme yapmaz', async () => {
    const { handler, prisma } = build(null);

    await expect(
      handler.handle({ event: 'REJECTED', message_template_id: 1 }),
    ).resolves.toBeUndefined();
    expect(prisma.whatsAppTemplate.update).not.toHaveBeenCalled();
  });

  it('yönetici bildirimi başarısız olsa da olay işlenmiş sayılır', async () => {
    const { handler, prisma, notifications } = build();
    notifications.notifyAdmins.mockRejectedValueOnce(new Error('db down'));

    await expect(
      handler.handle({ event: 'DISABLED', message_template_id: 555 }),
    ).resolves.toBeUndefined();
    expect(prisma.whatsAppTemplate.update).toHaveBeenCalled();
  });
});
