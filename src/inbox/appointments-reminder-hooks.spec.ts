import { NotFoundException } from '@nestjs/common';
import { AppointmentsAdminService } from './appointments-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { RemindersService } from '../messaging/reminders/reminders.service';

// Randevu oluşturma ve durum değişiminde hatırlatma kancalarının çağrıldığını doğrular.
describe('AppointmentsAdminService reminder hooks', () => {
  const reminders = {
    scheduleFor: jest.fn<any, any>().mockResolvedValue(undefined),
    cancelFor: jest.fn<any, any>().mockResolvedValue(undefined),
  };
  const prisma = {
    appointment: {
      findUnique: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
    },
    conversation: { findMany: jest.fn<any, any>().mockResolvedValue([]) },
  };
  const inboxEvents = { emit: jest.fn<any, any>() };
  let service: AppointmentsAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppointmentsAdminService(
      prisma as unknown as PrismaService,
      inboxEvents as unknown as InboxEventsService,
      reminders as unknown as RemindersService,
    );
  });

  it('durum CANCELLED olduğunda bekleyen hatırlatmaları iptal eder', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'SCHEDULED',
      scheduledAt: new Date('2020-01-01T10:00:00Z'),
    });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', reminders: [] });

    await service.updateStatus('a1', 'CANCELLED');

    expect(reminders.cancelFor).toHaveBeenCalledWith('a1');
  });

  it('findOne hatırlatma kayıtlarıyla birlikte randevuyu döner', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a3',
      reminders: [{ kind: 'DAY_BEFORE', status: 'SENT' }],
    });
    const found = await service.findOne('a3');
    expect(found).toMatchObject({
      reminders: [{ kind: 'DAY_BEFORE', status: 'SENT' }],
    });
    expect(prisma.appointment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a3' } }),
    );
  });

  it('findOne olmayan randevu için 404 döner', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(service.findOne('yok')).rejects.toThrow(NotFoundException);
  });

  it('geçmiş randevu için COMPLETED de hatırlatmaları iptal eder', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a2',
      status: 'SCHEDULED',
      scheduledAt: new Date('2020-01-01T10:00:00Z'),
    });
    prisma.appointment.update.mockResolvedValue({ id: 'a2' });

    await service.updateStatus('a2', 'COMPLETED');

    expect(reminders.cancelFor).toHaveBeenCalledWith('a2');
  });

  it('hatırlatma iptali başarısız olsa bile durum güncellemesi döner', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a3',
      status: 'SCHEDULED',
      scheduledAt: new Date('2020-01-01T10:00:00Z'),
    });
    prisma.appointment.update.mockResolvedValue({ id: 'a3' });
    reminders.cancelFor.mockRejectedValueOnce(new Error('db'));

    await expect(service.updateStatus('a3', 'NO_SHOW' as any)).resolves.toEqual(
      { id: 'a3' },
    );
  });
});
