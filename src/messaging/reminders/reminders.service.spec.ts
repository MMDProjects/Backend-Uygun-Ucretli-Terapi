import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RemindersService } from './reminders.service';
import { ReminderStatus } from '@prisma/client';
import { REMINDER_DEFAULTS } from './reminder.constants';

function buildPrisma() {
  return {
    systemSetting: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    appointment: { findUnique: jest.fn() },
    appointmentReminder: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    whatsAppTemplate: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
}

const NOW = new Date('2026-10-26T12:00:00+03:00');

describe('RemindersService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: RemindersService;

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.systemSetting.findFirst.mockResolvedValue({
      ...REMINDER_DEFAULTS,
      id: 's1',
    });
    service = new RemindersService(prisma as unknown as PrismaService);
  });

  describe('getSettings', () => {
    it('kayıt yoksa varsayılanlar döner ve hatırlatma kapalıdır', async () => {
      prisma.systemSetting.findFirst.mockResolvedValue(null);
      const settings = await service.getSettings();
      expect(settings.reminderEnabled).toBe(false);
      expect(settings).toEqual(REMINDER_DEFAULTS);
    });
  });

  describe('scheduleFor', () => {
    function appointmentAt(iso: string, status = 'SCHEDULED') {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'a1',
        scheduledAt: new Date(iso),
        status,
      });
    }

    it('gün öncesi ve kısa hatırlatmayı oluşturur', async () => {
      appointmentAt('2026-10-28T15:00:00+03:00');
      prisma.appointmentReminder.findUnique.mockResolvedValue(null);

      await service.scheduleFor('a1', NOW);

      expect(prisma.appointmentReminder.create).toHaveBeenCalledTimes(2);
      const calls = prisma.appointmentReminder.create.mock.calls.map(
        (c: any[]) => c[0].data,
      );
      expect(calls[0]).toMatchObject({
        appointmentId: 'a1',
        kind: 'DAY_BEFORE',
      });
      expect(calls[0].scheduledFor.toISOString()).toBe(
        new Date('2026-10-27T15:00:00+03:00').toISOString(),
      );
      expect(calls[1]).toMatchObject({ kind: 'SHORT_BEFORE' });
      expect(calls[1].scheduledFor.toISOString()).toBe(
        new Date('2026-10-28T14:00:00+03:00').toISOString(),
      );
    });

    it('gün öncesi hatırlatma sessiz saate düşerse önceki akşam 20:00 olur', async () => {
      // 28 Ekim 08:00 randevu -> 27 Ekim 08:00 sessiz -> 26 Ekim 20:00
      appointmentAt('2026-10-28T08:00:00+03:00');
      prisma.appointmentReminder.findUnique.mockResolvedValue(null);

      await service.scheduleFor('a1', NOW);

      const day = prisma.appointmentReminder.create.mock.calls
        .map((c: any[]) => c[0].data)
        .find((d: any) => d.kind === 'DAY_BEFORE');
      expect(day.scheduledFor.toISOString()).toBe(
        new Date('2026-10-26T20:00:00+03:00').toISOString(),
      );
    });

    it('geçmişte kalan hatırlatmayı oluşturmaz', async () => {
      // 27 Ekim 20:00'de 28 Ekim 10:00 randevu: gün öncesi geçmişte kalır
      appointmentAt('2026-10-28T10:00:00+03:00');
      prisma.appointmentReminder.findUnique.mockResolvedValue(null);

      await service.scheduleFor('a1', new Date('2026-10-27T20:00:00+03:00'));

      const kinds = prisma.appointmentReminder.create.mock.calls.map(
        (c: any[]) => c[0].data.kind,
      );
      expect(kinds).toEqual(['SHORT_BEFORE']);
    });

    it('bekleyen geçmiş hatırlatmayı iptal eder', async () => {
      appointmentAt('2026-10-28T10:00:00+03:00');
      prisma.appointmentReminder.findUnique.mockImplementation(
        ({ where }: any) =>
          Promise.resolve(
            where.appointmentId_kind.kind === 'DAY_BEFORE'
              ? { id: 'r-day', status: 'PENDING' }
              : null,
          ),
      );

      await service.scheduleFor('a1', new Date('2026-10-27T20:00:00+03:00'));

      expect(prisma.appointmentReminder.update).toHaveBeenCalledWith({
        where: { id: 'r-day' },
        data: { status: 'CANCELLED' },
      });
    });

    it('kısa hatırlatma dakikası ayardan alınır', async () => {
      prisma.systemSetting.findFirst.mockResolvedValue({
        ...REMINDER_DEFAULTS,
        id: 's1',
        reminderShortMinutes: 30,
      });
      appointmentAt('2026-10-28T10:00:00+03:00');
      prisma.appointmentReminder.findUnique.mockResolvedValue(null);

      await service.scheduleFor('a1', NOW);

      const short = prisma.appointmentReminder.create.mock.calls
        .map((c: any[]) => c[0].data)
        .find((d: any) => d.kind === 'SHORT_BEFORE');
      expect(short.scheduledFor.toISOString()).toBe(
        new Date('2026-10-28T09:30:00+03:00').toISOString(),
      );
    });

    it('mevcut PENDING kaydın zamanını günceller', async () => {
      appointmentAt('2026-10-28T15:00:00+03:00');
      prisma.appointmentReminder.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'PENDING',
      });

      await service.scheduleFor('a1', NOW);

      expect(prisma.appointmentReminder.create).not.toHaveBeenCalled();
      expect(prisma.appointmentReminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r1' },
          data: expect.objectContaining({ status: 'PENDING', attempts: 0 }),
        }),
      );
    });

    it('gönderilmiş (SENT) hatırlatmayı değiştirmez', async () => {
      appointmentAt('2026-10-28T15:00:00+03:00');
      prisma.appointmentReminder.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'SENT',
      });

      await service.scheduleFor('a1', NOW);

      expect(prisma.appointmentReminder.update).not.toHaveBeenCalled();
      expect(prisma.appointmentReminder.create).not.toHaveBeenCalled();
    });

    it('randevu SCHEDULED değilse bekleyenleri iptal eder', async () => {
      appointmentAt('2026-10-28T15:00:00+03:00', 'CANCELLED');

      await service.scheduleFor('a1', NOW);

      expect(prisma.appointmentReminder.updateMany).toHaveBeenCalledWith({
        where: { appointmentId: 'a1', status: { in: ['PENDING', 'SENDING'] } },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.appointmentReminder.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelFor', () => {
    it('yalnızca PENDING ve SENDING kayıtları CANCELLED yapar', async () => {
      await service.cancelFor('a1');
      expect(prisma.appointmentReminder.updateMany).toHaveBeenCalledWith({
        where: { appointmentId: 'a1', status: { in: ['PENDING', 'SENDING'] } },
        data: { status: 'CANCELLED' },
      });
    });
  });

  describe('updateSettings', () => {
    it('iki şablon seçilmeden hatırlatma açılamaz', async () => {
      await expect(
        service.updateSettings({ reminderEnabled: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.systemSetting.findFirst).toHaveBeenCalled();
    });

    it('onaylı olmayan şablon seçilemez', async () => {
      prisma.whatsAppTemplate.findUnique.mockResolvedValue({
        status: 'PENDING',
      });
      await expect(
        service.updateSettings({
          reminderDayBeforeTemplateId: '11111111-1111-4111-8111-111111111111',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('bulunamayan şablon 404 verir', async () => {
      prisma.whatsAppTemplate.findUnique.mockResolvedValue(null);
      await expect(
        service.updateSettings({
          reminderShortTemplateId: '11111111-1111-4111-8111-111111111111',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('UTILITY dışı kategorideki şablonu 400 ile reddeder', async () => {
      prisma.whatsAppTemplate.findUnique.mockResolvedValue({
        status: 'APPROVED',
        category: 'MARKETING',
      });

      await expect(
        service.updateSettings({
          reminderShortTemplateId: '11111111-1111-4111-8111-111111111111',
        }),
      ).rejects.toThrow(
        'Hatırlatma için yalnızca UTILITY kategorisinde şablon seçilebilir.',
      );
      expect(prisma.systemSetting.update).not.toHaveBeenCalled();
    });

    it('iki onaylı şablonla açıldığında kaydeder', async () => {
      prisma.whatsAppTemplate.findUnique.mockResolvedValue({
        status: 'APPROVED',
        category: 'UTILITY',
      });
      prisma.systemSetting.findFirst
        .mockResolvedValueOnce({ id: 's1' })
        .mockResolvedValue({
          ...REMINDER_DEFAULTS,
          id: 's1',
          reminderEnabled: true,
          reminderDayBeforeTemplateId: 'd1',
          reminderShortTemplateId: 's1t',
        });
      const dto = {
        reminderEnabled: true,
        reminderDayBeforeTemplateId: '11111111-1111-4111-8111-111111111111',
        reminderShortTemplateId: '22222222-2222-4222-8222-222222222222',
      };

      const result = await service.updateSettings(dto);

      expect(result.reminderEnabled).toBe(true);
      expect(prisma.appointmentReminder.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('FAILED kaydı PENDING yapar ve şimdi zamanlar', async () => {
      prisma.appointmentReminder.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'FAILED',
      });
      prisma.appointmentReminder.update.mockResolvedValue({ id: 'r1' });

      await service.retry('r1', NOW);

      expect(prisma.appointmentReminder.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: {
          status: 'PENDING',
          scheduledFor: NOW,
          attempts: 0,
          error: null,
        },
      });
    });

    it('SENT kaydı yeniden denenemez', async () => {
      prisma.appointmentReminder.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'SENT',
      });
      await expect(service.retry('r1', NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.appointmentReminder.update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
        Promise.all(ops),
      );
      prisma.appointmentReminder.findMany.mockResolvedValue([{ id: 'r1' }]);
      prisma.appointmentReminder.count.mockResolvedValue(1);
    });

    it('durum ve tarih aralığı filtrelerini where koşuluna çevirir', async () => {
      const result = await service.list({
        status: ReminderStatus.FAILED,
        from: '2026-10-27T00:00:00+03:00',
        to: '2026-10-28T00:00:00+03:00',
      });

      const where = prisma.appointmentReminder.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('FAILED');
      expect(where.scheduledFor.gte).toEqual(
        new Date('2026-10-27T00:00:00+03:00'),
      );
      expect(where.scheduledFor.lte).toEqual(
        new Date('2026-10-28T00:00:00+03:00'),
      );
      expect(prisma.appointmentReminder.count).toHaveBeenCalledWith({ where });
      expect(result).toMatchObject({ data: [{ id: 'r1' }], total: 1 });
    });

    it('yalnızca from verilirse lte alanı eklenmez', async () => {
      await service.list({ from: '2026-10-27T00:00:00+03:00' });

      const where = prisma.appointmentReminder.findMany.mock.calls[0][0].where;
      expect(where.scheduledFor).toEqual({
        gte: new Date('2026-10-27T00:00:00+03:00'),
      });
    });

    it('filtre yoksa where boş kalır', async () => {
      await service.list({});

      expect(
        prisma.appointmentReminder.findMany.mock.calls[0][0].where,
      ).toEqual({});
    });

    it('geçersiz tarihte 400 döner', async () => {
      await expect(service.list({ from: 'dün' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.appointmentReminder.findMany).not.toHaveBeenCalled();
    });
  });
});
