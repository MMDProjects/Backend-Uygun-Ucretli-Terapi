import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  ApprovalStatus,
  AppointmentStatus,
  ConversationStatus,
  ContactLifecycle,
  LeadStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { parsePagination } from '../common/pagination';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';

const DEFAULT_DURATION_MINUTES = 45;
const MAX_DURATION_MINUTES = 240;
const MS_PER_MINUTE = 60 * 1000;
const ISTANBUL_TZ = 'Europe/Istanbul';
// Türkiye 2016'dan beri sabit UTC+3 kullanır
const ISTANBUL_OFFSET = '+03:00';
const SLOT_CONFLICT_MESSAGE = 'Bu müsaitlik zaten bir randevuya bağlı.';

const APPOINTMENT_INCLUDE = {
  therapist: {
    select: {
      id: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
  contact: {
    select: { id: true, fullName: true, phone: true, lifecycleStatus: true },
  },
} as const;

// Yalnızca planlanmış randevu bu durumlara geçebilir
const ALLOWED_NEXT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.CANCELLED,
];
// Geldi / Gelmedi yalnızca randevu saati geçtikten sonra işaretlenebilir
const PAST_ONLY_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

// Slot tarihinin İstanbul günü ile HH:MM saatini +03:00 ofsetiyle birleştirir
export function slotStart(date: Date, startTime: string): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const start = new Date(`${ymd}T${startTime}:00${ISTANBUL_OFFSET}`);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException('Müsaitlik saati geçersiz');
  }
  return start;
}

@Injectable()
export class AppointmentsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  async list(filters: ListAppointmentsQueryDto) {
    const scheduledAt: { gte?: Date; lte?: Date } = {};
    if (filters.from) scheduledAt.gte = this.parseDate(filters.from, 'from');
    if (filters.to) scheduledAt.lte = this.parseDate(filters.to, 'to');

    const pg = parsePagination(filters.page, filters.limit, {
      defaultLimit: 100,
      maxLimit: 100,
    });

    return this.prisma.appointment.findMany({
      where: {
        ...(filters.contactId && { contactId: filters.contactId }),
        ...(filters.therapistId && { therapistId: filters.therapistId }),
        ...(filters.status && { status: filters.status }),
        ...(Object.keys(scheduledAt).length > 0 && { scheduledAt }),
      },
      orderBy: { scheduledAt: 'asc' },
      include: APPOINTMENT_INCLUDE,
      skip: pg.skip,
      take: pg.limit,
    });
  }

  async create(dto: CreateAppointmentDto) {
    const [contact, therapist, lead] = await Promise.all([
      this.prisma.contact.findUnique({
        where: { id: dto.contactId },
        select: { id: true },
      }),
      this.prisma.expertProfile.findUnique({
        where: { id: dto.therapistId },
        select: { id: true, status: true },
      }),
      dto.leadId
        ? this.prisma.lead.findUnique({
            where: { id: dto.leadId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!contact) throw new NotFoundException('Danışan bulunamadı');
    if (!therapist) throw new NotFoundException('Uzman bulunamadı');
    if (dto.leadId && !lead)
      throw new NotFoundException('Arama talebi bulunamadı');

    if (
      therapist.status !== ApprovalStatus.YAYINDA &&
      therapist.status !== ApprovalStatus.REVIZE_GONDERILDI
    ) {
      throw new BadRequestException(
        'Yalnızca onaylı uzmanlara randevu oluşturulabilir.',
      );
    }

    const scheduledAt = dto.availabilityId
      ? await this.resolveSlotStart(dto.availabilityId, dto.therapistId)
      : this.requireScheduledAt(dto.scheduledAt);
    const durationMinutes = dto.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    await this.assertNoConflict(dto.therapistId, scheduledAt, durationMinutes);

    const roomToken = crypto.randomBytes(24).toString('hex');
    const appointmentOp = this.prisma.appointment.create({
      data: {
        contactId: dto.contactId,
        therapistId: dto.therapistId,
        serviceType: dto.serviceType,
        scheduledAt,
        durationMinutes,
        paymentStatus: dto.paymentStatus ?? PaymentStatus.PENDING,
        roomToken,
        availabilityId: dto.availabilityId ?? null,
      },
      include: APPOINTMENT_INCLUDE,
    });
    // Randevusu oluşan potansiyel danışan, danışana dönüşür
    const lifecycleOp = this.prisma.contact.updateMany({
      where: {
        id: dto.contactId,
        lifecycleStatus: ContactLifecycle.POTANSIYEL,
      },
      data: { lifecycleStatus: ContactLifecycle.DANISAN },
    });
    const operations = [
      appointmentOp,
      lifecycleOp,
      ...(dto.leadId
        ? [
            this.prisma.lead.update({
              where: { id: dto.leadId },
              data: { status: LeadStatus.RANDEVU_OLUSTURULDU },
            }),
          ]
        : []),
    ];

    let appointment: Awaited<typeof appointmentOp>;
    try {
      const results = await this.prisma.$transaction(operations);
      appointment = results[0] as Awaited<typeof appointmentOp>;
    } catch (err) {
      // Aynı slota eşzamanlı istekler gelirse availabilityId unique ihlali olur
      if (dto.availabilityId && isUniqueViolation(err)) {
        throw new ConflictException(SLOT_CONFLICT_MESSAGE);
      }
      throw err;
    }

    const openConversations = await this.prisma.conversation.findMany({
      where: {
        contactId: dto.contactId,
        status: {
          in: [ConversationStatus.OPEN, ConversationStatus.PENDING_AGENT],
        },
      },
      select: { id: true },
    });
    for (const conversation of openConversations) {
      this.inboxEvents.emit('conversation.updated', {
        conversationId: conversation.id,
      });
    }
    this.inboxEvents.emit('counts.changed', {});

    return appointment;
  }

  async updateStatus(id: string, status: AppointmentStatus) {
    const existing = await this.prisma.appointment.findUnique({
      where: { id },
      select: { id: true, status: true, scheduledAt: true },
    });
    if (!existing) throw new NotFoundException('Randevu bulunamadı');

    if (existing.status !== AppointmentStatus.SCHEDULED) {
      throw new BadRequestException(
        'Yalnızca planlanmış randevunun durumu değiştirilebilir.',
      );
    }
    if (!ALLOWED_NEXT_STATUSES.includes(status)) {
      throw new BadRequestException('Geçersiz randevu durumu geçişi.');
    }
    if (
      PAST_ONLY_STATUSES.includes(status) &&
      existing.scheduledAt.getTime() > Date.now()
    ) {
      throw new BadRequestException(
        'Randevu saati geçmeden Geldi/Gelmedi işaretlenemez.',
      );
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status,
        // İptal edilen randevunun slotu serbest kalır
        ...(status === AppointmentStatus.CANCELLED && {
          availabilityId: null,
        }),
      },
      include: APPOINTMENT_INCLUDE,
    });
  }

  // Slot uzmana ait, engelsiz ve boş olmalı; randevu başlangıcını döner
  private async resolveSlotStart(
    availabilityId: string,
    therapistId: string,
  ): Promise<Date> {
    const slot = await this.prisma.availability.findUnique({
      where: { id: availabilityId },
      select: {
        expertProfileId: true,
        date: true,
        startTime: true,
        isBlockedByAdmin: true,
        appointment: { select: { id: true } },
      },
    });
    if (!slot) throw new NotFoundException('Müsaitlik bulunamadı');
    if (slot.expertProfileId !== therapistId) {
      throw new ConflictException('Müsaitlik seçilen uzmana ait değil.');
    }
    if (slot.isBlockedByAdmin) {
      throw new ConflictException('Bu müsaitlik engellenmiş.');
    }
    if (slot.appointment) {
      throw new ConflictException(SLOT_CONFLICT_MESSAGE);
    }
    return slotStart(slot.date, slot.startTime);
  }

  private requireScheduledAt(value?: string): Date {
    if (!value) {
      throw new BadRequestException(
        'scheduledAt veya availabilityId alanlarından biri zorunlu.',
      );
    }
    return this.parseDate(value, 'scheduledAt');
  }

  private async assertNoConflict(
    therapistId: string,
    start: Date,
    durationMinutes: number,
  ): Promise<void> {
    const startMs = start.getTime();
    const endMs = startMs + durationMinutes * MS_PER_MINUTE;
    const windowStartMs = startMs - MAX_DURATION_MINUTES * MS_PER_MINUTE;

    const candidates = await this.prisma.appointment.findMany({
      where: {
        therapistId,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: { gte: new Date(windowStartMs), lt: new Date(endMs) },
      },
      select: { scheduledAt: true, durationMinutes: true },
    });

    const overlaps = candidates.some((existing) => {
      const existingStartMs = existing.scheduledAt.getTime();
      const existingEndMs =
        existingStartMs + existing.durationMinutes * MS_PER_MINUTE;
      return existingStartMs < endMs && existingEndMs > startMs;
    });

    if (overlaps) {
      throw new ConflictException('Uzmanın bu saatte başka bir randevusu var.');
    }
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Geçersiz tarih: ${field}`);
    }
    return date;
  }
}
