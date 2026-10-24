import { BadRequestException, ConflictException } from '@nestjs/common';
import { AppointmentsAdminService } from './appointments-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

function buildPrismaMock() {
  return {
    contact: { findUnique: jest.fn<any, any>() },
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
  });
});
