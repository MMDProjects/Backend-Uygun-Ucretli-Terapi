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
  LeadStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

const DEFAULT_DURATION_MINUTES = 45;
const MAX_DURATION_MINUTES = 240;
const MS_PER_MINUTE = 60 * 1000;

const APPOINTMENT_INCLUDE = {
  therapist: {
    select: {
      id: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

@Injectable()
export class AppointmentsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  async list(filters: {
    contactId?: string;
    therapistId?: string;
    from?: string;
    to?: string;
  }) {
    const scheduledAt: { gte?: Date; lte?: Date } = {};
    if (filters.from) scheduledAt.gte = this.parseDate(filters.from, 'from');
    if (filters.to) scheduledAt.lte = this.parseDate(filters.to, 'to');

    return this.prisma.appointment.findMany({
      where: {
        ...(filters.contactId && { contactId: filters.contactId }),
        ...(filters.therapistId && { therapistId: filters.therapistId }),
        ...(Object.keys(scheduledAt).length > 0 && { scheduledAt }),
      },
      orderBy: { scheduledAt: 'asc' },
      include: APPOINTMENT_INCLUDE,
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

    const scheduledAt = this.parseDate(dto.scheduledAt, 'scheduledAt');
    const durationMinutes = dto.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    await this.assertNoConflict(dto.therapistId, scheduledAt, durationMinutes);

    const roomToken = crypto.randomBytes(24).toString('hex');
    const operations = [
      this.prisma.appointment.create({
        data: {
          contactId: dto.contactId,
          therapistId: dto.therapistId,
          serviceType: dto.serviceType,
          scheduledAt,
          durationMinutes,
          paymentStatus: dto.paymentStatus ?? PaymentStatus.PENDING,
          roomToken,
        },
        include: APPOINTMENT_INCLUDE,
      }),
      ...(dto.leadId
        ? [
            this.prisma.lead.update({
              where: { id: dto.leadId },
              data: { status: LeadStatus.RANDEVU_OLUSTURULDU },
            }),
          ]
        : []),
    ];
    const [appointment] = await this.prisma.$transaction(operations);

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
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Randevu bulunamadı');

    return this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: APPOINTMENT_INCLUDE,
    });
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
