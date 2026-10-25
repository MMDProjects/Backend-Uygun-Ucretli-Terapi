import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsAdminService } from './appointments-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentStatus } from '@prisma/client';

function buildPrismaMock() {
  return {
    contact: {
      findUnique: jest.fn<any, any>(),
      updateMany: jest.fn<any, any>(),
    },
    availability: { findUnique: jest.fn<any, any>() },
    expertProfile: { findUnique: jest.fn<any, any>() },
    lead: {
      findUnique: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
    },
    appointment: {
      findMany: jest.fn<any, any>(),
      create: jest.fn<any, any>(),
      findUnique: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
    },
    conversation: { findMany: jest.fn<any, any>() },
    $transaction: jest.fn<any, any>(),
  };
}

const CONTACT_ID = '11111111-1111-4111-8111-111111111111';
const THERAPIST_ID = '22222222-2222-4222-8222-222222222222';
const LEAD_ID = '33333333-3333-4333-8333-333333333333';

function buildDto(overrides: Partial<CreateAppointmentDto> = {}) {
  return {
    contactId: CONTACT_ID,
    therapistId: THERAPIST_ID,
    serviceType: 'BIREYSEL',
    scheduledAt: '2026-11-10T10:00:00.000Z',
    durationMinutes: 45,
    ...overrides,
  } as CreateAppointmentDto;
}

describe('AppointmentsAdminService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let inboxEvents: { emit: jest.Mock };
  let service: AppointmentsAdminService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    inboxEvents = { emit: jest.fn<any, any>() };
    service = new AppointmentsAdminService(
      prisma as unknown as PrismaService,
      inboxEvents as unknown as InboxEventsService,
    );

    prisma.contact.findUnique.mockResolvedValue({ id: CONTACT_ID });
    prisma.expertProfile.findUnique.mockResolvedValue({
      id: THERAPIST_ID,
      status: 'YAYINDA',
    });
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'appt-1', ...data }),
    );
    prisma.lead.update.mockResolvedValue({ id: LEAD_ID });
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    prisma.conversation.findMany.mockResolvedValue([]);
  });

  describe('create', () => {
    it('throws 409 when an overlapping scheduled appointment exists', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        {
          scheduledAt: new Date('2026-11-10T09:30:00.000Z'),
          durationMinutes: 45,
        },
      ]);

      await expect(service.create(buildDto())).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('allows an appointment that starts exactly when another ends', async () => {
      prisma.appointment.findMany.mockResolvedValue([
        {
          scheduledAt: new Date('2026-11-10T09:15:00.000Z'),
          durationMinutes: 45,
        },
      ]);

      await expect(service.create(buildDto())).resolves.toBeDefined();
      expect(prisma.appointment.create).toHaveBeenCalledTimes(1);
    });

    it('throws 400 when the expert is not approved', async () => {
      prisma.expertProfile.findUnique.mockResolvedValue({
        id: THERAPIST_ID,
        status: 'ONAY_BEKLIYOR',
      });

      await expect(service.create(buildDto())).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('accepts an expert in REVIZE_GONDERILDI status', async () => {
      prisma.expertProfile.findUnique.mockResolvedValue({
        id: THERAPIST_ID,
        status: 'REVIZE_GONDERILDI',
      });

      await expect(service.create(buildDto())).resolves.toBeDefined();
    });

    it('sets the lead status to RANDEVU_OLUSTURULDU when leadId is given', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: LEAD_ID });

      await service.create(buildDto({ leadId: LEAD_ID }));

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: LEAD_ID },
        data: { status: 'RANDEVU_OLUSTURULDU' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('generates a 48 character hex room token', async () => {
      await service.create(buildDto());

      const { data } = prisma.appointment.create.mock.calls[0][0];
      expect(data.roomToken).toMatch(/^[0-9a-f]{48}$/);
    });

    it('emits conversation.updated for open conversations and counts.changed', async () => {
      prisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);

      await service.create(buildDto());

      expect(inboxEvents.emit).toHaveBeenCalledWith('conversation.updated', {
        conversationId: 'conv-1',
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
    });

    it('moves a POTENTIAL contact to DANISAN in the same transaction', async () => {
      await service.create(buildDto());

      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { id: CONTACT_ID, lifecycleStatus: 'POTANSIYEL' },
        data: { lifecycleStatus: 'DANISAN' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('requires scheduledAt when availabilityId is not given', async () => {
      await expect(
        service.create(buildDto({ scheduledAt: undefined })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    describe('with availabilityId', () => {
      const SLOT_ID = '44444444-4444-4444-8444-444444444444';

      function slot(overrides: Record<string, unknown> = {}) {
        return {
          expertProfileId: THERAPIST_ID,
          // Istanbul'da 10 Kasım 2026 günü; UTC'de önceki gece 21:00 olabilir
          date: new Date('2026-11-09T21:00:00.000Z'),
          startTime: '10:00',
          isBlockedByAdmin: false,
          appointment: null,
          ...overrides,
        };
      }

      it('throws 404 when the slot does not exist', async () => {
        prisma.availability.findUnique.mockResolvedValue(null);

        await expect(
          service.create(buildDto({ availabilityId: SLOT_ID })),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.appointment.create).not.toHaveBeenCalled();
      });

      it('throws 409 when the slot belongs to another expert', async () => {
        prisma.availability.findUnique.mockResolvedValue(
          slot({ expertProfileId: 'other-expert' }),
        );

        await expect(
          service.create(buildDto({ availabilityId: SLOT_ID })),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('throws 409 when the slot is blocked by admin', async () => {
        prisma.availability.findUnique.mockResolvedValue(
          slot({ isBlockedByAdmin: true }),
        );

        await expect(
          service.create(buildDto({ availabilityId: SLOT_ID })),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('throws 409 when the slot is already linked to an appointment', async () => {
        prisma.availability.findUnique.mockResolvedValue(
          slot({ appointment: { id: 'appt-0' } }),
        );

        await expect(
          service.create(buildDto({ availabilityId: SLOT_ID })),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.appointment.create).not.toHaveBeenCalled();
      });

      // Randevu availabilityId'de @unique olduğu için geçmiş (COMPLETED, NO_SHOW)
      // bağlı slota yeni randevu yazılamaz; 409 bu yüzden zorunludur.
      it.each([AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW])(
        'throws 409 when the slot is linked to a %s appointment',
        async (status) => {
          prisma.availability.findUnique.mockResolvedValue(
            slot({ appointment: { id: 'appt-0', status } }),
          );

          await expect(
            service.create(buildDto({ availabilityId: SLOT_ID })),
          ).rejects.toBeInstanceOf(ConflictException);
          expect(prisma.appointment.create).not.toHaveBeenCalled();
        },
      );

      it('computes scheduledAt from the slot date and start time in Istanbul time', async () => {
        prisma.availability.findUnique.mockResolvedValue(slot());

        await service.create(
          buildDto({ availabilityId: SLOT_ID, scheduledAt: undefined }),
        );

        const { data } = prisma.appointment.create.mock.calls[0][0];
        // 10:00 +03:00 = 07:00 UTC
        expect(data.scheduledAt).toEqual(new Date('2026-11-10T07:00:00.000Z'));
        expect(data.availabilityId).toBe(SLOT_ID);
      });

      it('still checks overlaps with other appointments of the expert', async () => {
        prisma.availability.findUnique.mockResolvedValue(slot());
        prisma.appointment.findMany.mockResolvedValue([
          {
            scheduledAt: new Date('2026-11-10T07:30:00.000Z'),
            durationMinutes: 45,
          },
        ]);

        await expect(
          service.create(buildDto({ availabilityId: SLOT_ID })),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('maps a unique availabilityId violation (P2002) to 409', async () => {
        prisma.availability.findUnique.mockResolvedValue(slot());
        prisma.$transaction.mockRejectedValue({ code: 'P2002' });

        await expect(
          service.create(buildDto({ availabilityId: SLOT_ID })),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('rethrows unrelated transaction errors', async () => {
        prisma.availability.findUnique.mockResolvedValue(slot());
        prisma.$transaction.mockRejectedValue(new Error('db down'));

        await expect(
          service.create(buildDto({ availabilityId: SLOT_ID })),
        ).rejects.toThrow('db down');
      });
    });
  });

  describe('updateStatus', () => {
    const APPT_ID = '55555555-5555-4555-8555-555555555555';
    const PAST = new Date(Date.now() - 60 * 60 * 1000);
    const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

    function appointment(status: AppointmentStatus, scheduledAt: Date = PAST) {
      return { id: APPT_ID, status, scheduledAt };
    }

    beforeEach(() => {
      prisma.appointment.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: APPT_ID, ...data }),
      );
    });

    it('throws 404 when the appointment does not exist', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(APPT_ID, AppointmentStatus.CANCELLED),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks a past scheduled appointment as COMPLETED', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        appointment(AppointmentStatus.SCHEDULED),
      );

      await service.updateStatus(APPT_ID, AppointmentStatus.COMPLETED);

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: AppointmentStatus.COMPLETED },
        }),
      );
    });

    it('marks a past scheduled appointment as NO_SHOW', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        appointment(AppointmentStatus.SCHEDULED),
      );

      await service.updateStatus(APPT_ID, AppointmentStatus.NO_SHOW);

      expect(prisma.appointment.update).toHaveBeenCalledTimes(1);
    });

    it('rejects COMPLETED and NO_SHOW before the appointment time', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        appointment(AppointmentStatus.SCHEDULED, FUTURE),
      );

      await expect(
        service.updateStatus(APPT_ID, AppointmentStatus.COMPLETED),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateStatus(APPT_ID, AppointmentStatus.NO_SHOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('allows cancelling a future scheduled appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        appointment(AppointmentStatus.SCHEDULED, FUTURE),
      );

      await service.updateStatus(APPT_ID, AppointmentStatus.CANCELLED);

      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: AppointmentStatus.CANCELLED,
            availabilityId: null,
          },
        }),
      );
    });

    it('rejects a transition from a non-scheduled status', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        appointment(AppointmentStatus.COMPLETED),
      );

      await expect(
        service.updateStatus(APPT_ID, AppointmentStatus.CANCELLED),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('rejects SCHEDULED to SCHEDULED', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        appointment(AppointmentStatus.SCHEDULED),
      );

      await expect(
        service.updateStatus(APPT_ID, AppointmentStatus.SCHEDULED),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps the slot link for COMPLETED and NO_SHOW', async () => {
      prisma.appointment.findUnique.mockResolvedValue(
        appointment(AppointmentStatus.SCHEDULED),
      );

      await service.updateStatus(APPT_ID, AppointmentStatus.NO_SHOW);

      const { data } = prisma.appointment.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('availabilityId');
    });
  });

  describe('list', () => {
    beforeEach(() => {
      prisma.appointment.findMany.mockResolvedValue([]);
    });

    it('applies contact, therapist, status and date filters', async () => {
      await service.list({
        contactId: CONTACT_ID,
        therapistId: THERAPIST_ID,
        status: AppointmentStatus.SCHEDULED,
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-30T23:59:59.000Z',
      });

      const { where } = prisma.appointment.findMany.mock.calls[0][0];
      expect(where).toEqual({
        contactId: CONTACT_ID,
        therapistId: THERAPIST_ID,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: {
          gte: new Date('2026-11-01T00:00:00.000Z'),
          lte: new Date('2026-11-30T23:59:59.000Z'),
        },
      });
    });

    it('uses no filters when none is given', async () => {
      await service.list({});

      const { where } = prisma.appointment.findMany.mock.calls[0][0];
      expect(where).toEqual({});
    });

    it('paginates with skip and take', async () => {
      await service.list({
        page: 2,
        limit: 10,
      });

      const args = prisma.appointment.findMany.mock.calls[0][0];
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
    });

    it('includes contact and therapist info', async () => {
      await service.list({});

      const { include } = prisma.appointment.findMany.mock.calls[0][0];
      expect(include.contact.select).toHaveProperty('fullName');
      expect(include.therapist).toBeDefined();
    });
  });
});
