import { NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { ExpertsService } from './experts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const EXPERT_ID = '55555555-5555-4555-8555-555555555555';

function buildPrismaMock() {
  return {
    expertProfile: {
      findFirst: jest.fn<any, any>(),
      findUnique: jest.fn<any, any>(),
    },
    availability: {
      findMany: jest.fn<any, any>(),
    },
  };
}

describe('ExpertsService.getExpertAvailabilities', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: ExpertsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new ExpertsService(
      prisma as unknown as PrismaService,
      {} as unknown as StorageService,
    );
    prisma.expertProfile.findFirst.mockResolvedValue({ id: EXPERT_ID });
  });

  it('yayında olmayan uzman için 404 döner', async () => {
    prisma.expertProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.getExpertAvailabilities(EXPERT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.availability.findMany).not.toHaveBeenCalled();
  });

  it('bağlı randevusu olan slotu booked: true olarak döner', async () => {
    prisma.availability.findMany.mockResolvedValue([
      {
        id: 's1',
        startTime: '10:00',
        endTime: '10:45',
        isBlockedByAdmin: false,
        appointment: { id: 'appt-1', status: AppointmentStatus.SCHEDULED },
      },
    ]);

    const [slot] = await service.getExpertAvailabilities(EXPERT_ID);

    expect(slot).toMatchObject({ id: 's1', booked: true });
  });

  it('COMPLETED ve NO_SHOW bağlı slotlar da dolu sayılır', async () => {
    prisma.availability.findMany.mockResolvedValue([
      {
        id: 's1',
        appointment: { id: 'a1', status: AppointmentStatus.COMPLETED },
      },
      {
        id: 's2',
        appointment: { id: 'a2', status: AppointmentStatus.NO_SHOW },
      },
    ]);

    const slots = await service.getExpertAvailabilities(EXPERT_ID);

    expect(slots.map((s) => s.booked)).toEqual([true, true]);
  });

  it('randevusuz ve iptal edilmiş slotları boş olarak döner', async () => {
    prisma.availability.findMany.mockResolvedValue([
      { id: 's1', appointment: null },
      {
        id: 's2',
        appointment: { id: 'a1', status: AppointmentStatus.CANCELLED },
      },
    ]);

    const slots = await service.getExpertAvailabilities(EXPERT_ID);

    expect(slots.map((s) => s.booked)).toEqual([false, false]);
  });

  it('randevu kimliğini ve appointment alanını herkese açık yanıtta göstermez', async () => {
    prisma.availability.findMany.mockResolvedValue([
      {
        id: 's1',
        appointment: { id: 'appt-secret', status: AppointmentStatus.SCHEDULED },
      },
    ]);

    const [slot] = await service.getExpertAvailabilities(EXPERT_ID);

    expect(slot).not.toHaveProperty('appointment');
    expect(slot).not.toHaveProperty('appointmentId');
    expect(JSON.stringify(slot)).not.toContain('appt-secret');
  });

  it('yalnızca engellenmemiş ve bugünden sonraki slotları sorgular', async () => {
    prisma.availability.findMany.mockResolvedValue([]);

    await service.getExpertAvailabilities(EXPERT_ID);

    expect(prisma.availability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expertProfileId: EXPERT_ID,
          isBlockedByAdmin: false,
        }),
        include: { appointment: { select: { id: true, status: true } } },
        take: 42,
      }),
    );
  });
});
