import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  Prisma,
  ReminderKind,
  ReminderStatus,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginated, parsePagination } from '../../common/pagination';
import { shiftBeforeQuiet } from '../quiet-hours';
import { ListRemindersQueryDto } from './dto/list-reminders.query.dto';
import { UpdateReminderSettingsDto } from './dto/update-reminder-settings.dto';
import {
  DAY_BEFORE_MS,
  REMINDER_DEFAULTS,
  REMINDER_SETTINGS_SELECT,
  ReminderSettings,
} from './reminder.constants';

const MINUTE_MS = 60 * 1000;
const CANCELABLE: ReminderStatus[] = [
  ReminderStatus.PENDING,
  ReminderStatus.SENDING,
];
// Gönderilmiş ya da gönderimde olan hatırlatma yeniden planlanmaz.
const LOCKED: ReminderStatus[] = [ReminderStatus.SENT, ReminderStatus.SENDING];
const RETRYABLE: ReminderStatus[] = [
  ReminderStatus.FAILED,
  ReminderStatus.SKIPPED,
];

// Randevuya bağlı iki hatırlatmayı (gün öncesi ve kısa) planlar ve iptal eder.
@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<ReminderSettings> {
    const row = await this.prisma.systemSetting.findFirst({
      select: REMINDER_SETTINGS_SELECT,
    });
    return row ?? REMINDER_DEFAULTS;
  }

  async updateSettings(
    dto: UpdateReminderSettingsDto,
  ): Promise<ReminderSettings> {
    const row = await this.prisma.systemSetting.findFirst({
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException(
        'Sistem ayarı bulunamadı; önce site ayarları oluşturulmalı.',
      );
    }

    if (dto.reminderDayBeforeTemplateId) {
      await this.assertApprovedTemplate(dto.reminderDayBeforeTemplateId);
    }
    if (dto.reminderShortTemplateId) {
      await this.assertApprovedTemplate(dto.reminderShortTemplateId);
    }

    const changes = this.definedFields(dto);
    const current = await this.getSettings();
    const next = { ...current, ...changes };
    if (
      next.reminderEnabled &&
      (!next.reminderDayBeforeTemplateId || !next.reminderShortTemplateId)
    ) {
      throw new BadRequestException(
        'Hatırlatmaları açmadan önce iki şablon da seçilmelidir.',
      );
    }

    await this.prisma.systemSetting.update({
      where: { id: row.id },
      data: changes,
    });
    return this.getSettings();
  }

  // Randevu SCHEDULED ise gün öncesi ve kısa hatırlatmayı oluşturur ya da günceller.
  async scheduleFor(
    appointmentId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, scheduledAt: true, status: true },
    });
    if (!appointment) return;
    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      await this.cancelFor(appointmentId);
      return;
    }

    const settings = await this.getSettings();
    const startMs = appointment.scheduledAt.getTime();
    // Gün öncesi hatırlatma sessiz saate denk gelirse önceki akşama çekilir.
    const dayBefore = shiftBeforeQuiet(
      new Date(startMs - DAY_BEFORE_MS),
      settings.reminderQuietStart,
      settings.reminderQuietEnd,
    );
    const shortBefore = new Date(
      startMs - settings.reminderShortMinutes * MINUTE_MS,
    );

    await this.upsertKind(
      appointmentId,
      ReminderKind.DAY_BEFORE,
      dayBefore,
      now,
    );
    await this.upsertKind(
      appointmentId,
      ReminderKind.SHORT_BEFORE,
      shortBefore,
      now,
    );
  }

  // Randevu iptal, tamamlandı ya da gelmedi olduğunda bekleyenleri iptal eder.
  async cancelFor(appointmentId: string): Promise<void> {
    await this.prisma.appointmentReminder.updateMany({
      where: { appointmentId, status: { in: CANCELABLE } },
      data: { status: ReminderStatus.CANCELLED },
    });
  }

  async list(query: ListRemindersQueryDto) {
    const where: Prisma.AppointmentReminderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.scheduledFor = {
        ...(query.from && { gte: this.parseDate(query.from, 'from') }),
        ...(query.to && { lte: this.parseDate(query.to, 'to') }),
      };
    }

    const pg = parsePagination(query.page, query.limit, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const [data, total] = await this.prisma.$transaction([
      this.prisma.appointmentReminder.findMany({
        where,
        orderBy: { scheduledFor: 'asc' },
        skip: pg.skip,
        take: pg.limit,
        include: {
          appointment: {
            select: {
              id: true,
              scheduledAt: true,
              status: true,
              serviceType: true,
              contact: { select: { id: true, fullName: true, phone: true } },
              therapist: {
                select: {
                  id: true,
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.appointmentReminder.count({ where }),
    ]);
    return paginated(data, total, pg.page, pg.limit);
  }

  // Yalnızca başarısız ya da atlanmış hatırlatma yeniden kuyruğa alınır.
  async retry(id: string, now: Date = new Date()) {
    const reminder = await this.prisma.appointmentReminder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!reminder) throw new NotFoundException('Hatırlatma bulunamadı');
    if (!RETRYABLE.includes(reminder.status)) {
      throw new BadRequestException(
        'Yalnızca başarısız veya atlanmış hatırlatma yeniden denenebilir.',
      );
    }
    return this.prisma.appointmentReminder.update({
      where: { id },
      data: {
        status: ReminderStatus.PENDING,
        scheduledFor: now,
        attempts: 0,
        error: null,
      },
    });
  }

  private async upsertKind(
    appointmentId: string,
    kind: ReminderKind,
    target: Date,
    now: Date,
  ): Promise<void> {
    const existing = await this.prisma.appointmentReminder.findUnique({
      where: { appointmentId_kind: { appointmentId, kind } },
      select: { id: true, status: true },
    });

    // Geçmişte kalan hatırlatma oluşturulmaz; bekleyen varsa iptal edilir.
    if (target.getTime() <= now.getTime()) {
      if (existing && existing.status === ReminderStatus.PENDING) {
        await this.prisma.appointmentReminder.update({
          where: { id: existing.id },
          data: { status: ReminderStatus.CANCELLED },
        });
      }
      return;
    }

    if (!existing) {
      await this.prisma.appointmentReminder.create({
        data: { appointmentId, kind, scheduledFor: target },
      });
      return;
    }
    if (LOCKED.includes(existing.status)) return;

    await this.prisma.appointmentReminder.update({
      where: { id: existing.id },
      data: {
        scheduledFor: target,
        status: ReminderStatus.PENDING,
        attempts: 0,
        error: null,
      },
    });
  }

  // Hatırlatma şablonu onaylı ve UTILITY kategorisinde olmalıdır (plan E3).
  private async assertApprovedTemplate(id: string): Promise<void> {
    const template = await this.prisma.whatsAppTemplate.findUnique({
      where: { id },
      select: { status: true, category: true },
    });
    if (!template) throw new NotFoundException('Şablon bulunamadı');
    if (template.status !== TemplateStatus.APPROVED) {
      throw new BadRequestException('Yalnızca onaylı şablon seçilebilir.');
    }
    if (template.category !== TemplateCategory.UTILITY) {
      throw new BadRequestException(
        'Hatırlatma için yalnızca UTILITY kategorisinde şablon seçilebilir.',
      );
    }
  }

  // Gönderilen alanları toplar; tanımsız olanlar güncellemeye girmez.
  private definedFields(
    dto: UpdateReminderSettingsDto,
  ): Partial<ReminderSettings> {
    const data: Partial<ReminderSettings> = {};
    if (dto.reminderEnabled !== undefined) {
      data.reminderEnabled = dto.reminderEnabled;
    }
    if (dto.reminderDayBeforeTemplateId !== undefined) {
      data.reminderDayBeforeTemplateId = dto.reminderDayBeforeTemplateId;
    }
    if (dto.reminderShortTemplateId !== undefined) {
      data.reminderShortTemplateId = dto.reminderShortTemplateId;
    }
    if (dto.reminderShortMinutes !== undefined) {
      data.reminderShortMinutes = dto.reminderShortMinutes;
    }
    if (dto.reminderQuietStart !== undefined) {
      data.reminderQuietStart = dto.reminderQuietStart;
    }
    if (dto.reminderQuietEnd !== undefined) {
      data.reminderQuietEnd = dto.reminderQuietEnd;
    }
    return data;
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Geçersiz tarih: ${field}`);
    }
    return date;
  }
}
