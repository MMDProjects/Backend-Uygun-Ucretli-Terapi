import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentStatus,
  Channel,
  ConversationStatus,
  DeliveryStatus,
  ReminderKind,
  ReminderStatus,
  SenderType,
  TemplateStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InboxEventsService } from '../../inbox-events/inbox-events.service';
import {
  MetaSenderService,
  MetaSendResult,
} from '../../webhooks/meta-sender.service';
import { renderTemplate } from '../template-render';
import { normalizeWhatsAppPhone } from '../phone';
import { isQuiet } from '../quiet-hours';
import { RemindersService } from './reminders.service';
import {
  REMINDER_BATCH_SIZE,
  REMINDER_LATE_LIMIT_MS,
  REMINDER_MAX_ATTEMPTS,
  REMINDER_RETRY_DELAY_MS,
  REMINDER_STALE_SENDING_MS,
  REMINDER_TICK_MS,
  ReminderSettings,
} from './reminder.constants';

const ISTANBUL_TZ = 'Europe/Istanbul';
const FALLBACK_NAME = 'Danışanımız';
const FALLBACK_EXPERT = 'Uzmanınız';

const DATE_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  timeZone: ISTANBUL_TZ,
  day: 'numeric',
  month: 'long',
  weekday: 'long',
});
const TIME_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  timeZone: ISTANBUL_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface ReminderWithRelations {
  id: string;
  kind: ReminderKind;
  scheduledFor: Date;
  attempts: number;
  appointment: {
    id: string;
    status: AppointmentStatus;
    scheduledAt: Date;
    contact: {
      id: string;
      fullName: string | null;
      phone: string | null;
      reminderOptOut: boolean;
    };
    therapist: {
      user: { firstName: string; lastName: string };
    };
  };
}

// Şablon değişkenleri. 1 gün önce: {{1}} ad, {{2}} tarih, {{3}} saat, {{4}} uzman.
// Kısa hatırlatma: {{1}} ad, {{2}} saat, {{3}} tarih, {{4}} uzman (plan metni
// "görüşmeniz saat {{2}}'de" diye yazılı). Şablonun ilk N değişkeni kullanılır.
function buildTemplateValues(reminder: ReminderWithRelations): string[] {
  const { appointment } = reminder;
  const firstName = (appointment.contact.fullName ?? '').trim().split(/\s+/)[0];
  const expert = [
    appointment.therapist.user.firstName,
    appointment.therapist.user.lastName,
  ]
    .join(' ')
    .trim();
  const date = DATE_FORMAT.format(appointment.scheduledAt);
  const time = TIME_FORMAT.format(appointment.scheduledAt);
  const name = firstName || FALLBACK_NAME;
  const expertName = expert || FALLBACK_EXPERT;
  return reminder.kind === ReminderKind.SHORT_BEFORE
    ? [name, time, date, expertName]
    : [name, date, time, expertName];
}

// Hatırlatma işçisi: sessiz saat, gecikme ve çift gönderim kurallarını uygular.
// Zamanlayıcı yalnızca üretimde başlar; tick() testlerde doğrudan çağrılır.
@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
    private readonly meta: MetaSenderService,
    private readonly inboxEvents: InboxEventsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    // REMINDER_WORKER_ENABLED=false ile kapatılabilir; gönderimi asıl kapatan
    // panel ayarıdır (reminderEnabled, varsayılan kapalı).
    if (this.config.get<string>('REMINDER_WORKER_ENABLED') === 'false') return;

    this.timer = setInterval(() => void this.runScheduled(), REMINDER_TICK_MS);
    // Zamanlayıcı süreci canlı tutmasın (kapanış sırasında beklemesin).
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Önceki döngü bitmeden yeni döngü başlamaz.
  private async runScheduled(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Hatırlatma döngüsü hatası: ${errorText(err)}`);
    } finally {
      this.running = false;
    }
  }

  async tick(now: Date = new Date()): Promise<void> {
    await this.recoverStale(now);

    const settings = await this.reminders.getSettings();
    if (!settings.reminderEnabled) return;
    // Sessiz saatte hiçbir kayıt alınmaz; sabah gecikme sınırı kontrol edilir.
    if (isQuiet(now, settings.reminderQuietStart, settings.reminderQuietEnd)) {
      return;
    }

    const due = await this.prisma.appointmentReminder.findMany({
      where: {
        status: ReminderStatus.PENDING,
        scheduledFor: { lte: now },
      },
      orderBy: { scheduledFor: 'asc' },
      take: REMINDER_BATCH_SIZE,
      select: { id: true },
    });

    for (const { id } of due) {
      // Koşullu güncelleme: aynı kaydı iki işçi aynı anda alamaz.
      const claim = await this.prisma.appointmentReminder.updateMany({
        where: { id, status: ReminderStatus.PENDING },
        data: { status: ReminderStatus.SENDING },
      });
      if (claim.count !== 1) continue;

      try {
        await this.handle(id, settings, now);
      } catch (err) {
        this.logger.warn(`Hatırlatma işlenemedi (${id}): ${errorText(err)}`);
        const current = await this.prisma.appointmentReminder.findUnique({
          where: { id },
          select: { attempts: true },
        });
        await this.retryOrFail(
          id,
          (current?.attempts ?? 0) + 1,
          errorText(err),
          now,
        );
      }
    }
  }

  // Uzun süre SENDING'de kalan kayıtları (çöken işçi) yeniden bekleyene alır.
  private async recoverStale(now: Date): Promise<void> {
    await this.prisma.appointmentReminder.updateMany({
      where: {
        status: ReminderStatus.SENDING,
        updatedAt: { lt: new Date(now.getTime() - REMINDER_STALE_SENDING_MS) },
      },
      data: { status: ReminderStatus.PENDING },
    });
  }

  private async handle(
    id: string,
    settings: ReminderSettings,
    now: Date,
  ): Promise<void> {
    const reminder = await this.prisma.appointmentReminder.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        scheduledFor: true,
        attempts: true,
        appointment: {
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                reminderOptOut: true,
              },
            },
            therapist: {
              select: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    if (!reminder) return;

    const { appointment } = reminder;
    const { contact } = appointment;
    const skip = (reason: string) =>
      this.setStatus(id, ReminderStatus.SKIPPED, reason);

    if (
      appointment.status !== AppointmentStatus.SCHEDULED ||
      appointment.scheduledAt.getTime() <= now.getTime()
    ) {
      return skip('appointment_not_scheduled');
    }
    if (
      now.getTime() - reminder.scheduledFor.getTime() >
      REMINDER_LATE_LIMIT_MS[reminder.kind]
    ) {
      return skip('too_late');
    }
    if (contact.reminderOptOut) return skip('opt_out');
    if (!contact.phone) return skip('no_phone');
    const phone = normalizeWhatsAppPhone(contact.phone);
    if (!phone) return skip('invalid_phone');

    const templateId =
      reminder.kind === ReminderKind.DAY_BEFORE
        ? settings.reminderDayBeforeTemplateId
        : settings.reminderShortTemplateId;
    const template = templateId
      ? await this.prisma.whatsAppTemplate.findUnique({
          where: { id: templateId },
          select: {
            name: true,
            language: true,
            bodyText: true,
            variableCount: true,
            status: true,
          },
        })
      : null;
    if (!template || template.status !== TemplateStatus.APPROVED) {
      return skip('template_not_approved');
    }

    // Sessiz saatte gönderilmez. scheduledFor değişmez: sabah gönderilirse
    // gecikme sınırı (too_late) yine geçerlidir.
    if (isQuiet(now, settings.reminderQuietStart, settings.reminderQuietEnd)) {
      await this.setPending(id);
      return;
    }

    const values = buildTemplateValues(reminder);
    if (template.variableCount > values.length) {
      return skip('template_variables');
    }
    const params = values.slice(0, template.variableCount);

    const result = await this.send(phone, {
      name: template.name,
      language: template.language,
      params,
    });

    if (!result.ok) {
      await this.retryOrFail(
        id,
        reminder.attempts + 1,
        result.error ?? 'Gönderim başarısız',
        now,
      );
      return;
    }

    // Meta kabul etti: bu noktadan sonra yeniden deneme yapılmaz. Yazım
    // başarısızsa kayıt PENDING'e dönerse ikinci kez gönderilirdi; bunun
    // yerine FAILED işaretlenir ve personel "Tekrar dene" kararını verir.
    try {
      await this.prisma.appointmentReminder.update({
        where: { id },
        data: {
          status: ReminderStatus.SENT,
          sentAt: now,
          messageId: result.messageId ?? null,
          error: null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Hatırlatma gönderildi ama kaydedilemedi (${id}, ${result.messageId ?? '-'}): ${errorText(err)}`,
      );
      await this.markSentWriteFailed(id, result.messageId ?? null).catch(
        (markErr) =>
          this.logger.error(
            `Hatırlatma FAILED işaretlenemedi (${id}): ${errorText(markErr)}`,
          ),
      );
      return;
    }

    // Konuşma yazılamazsa gönderim yine de başarılıdır.
    try {
      await this.recordOutbound(
        contact.id,
        renderTemplate(template.bodyText, params),
        template.name,
        result.messageId ?? null,
        now,
      );
    } catch (err) {
      this.logger.warn(`Konuşmaya yazılamadı: ${errorText(err)}`);
    }
  }

  private async send(
    phone: string,
    template: { name: string; language: string; params: string[] },
  ): Promise<MetaSendResult> {
    try {
      return await this.meta.sendTemplate(phone, template);
    } catch (err) {
      return { ok: false, error: errorText(err) };
    }
  }

  // Açık ya da bekleyen WhatsApp konuşması varsa bota ait mesaj olarak yazar.
  private async recordOutbound(
    contactId: string,
    content: string,
    templateName: string,
    messageId: string | null,
    now: Date,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        contactId,
        channel: Channel.WHATSAPP,
        status: {
          in: [ConversationStatus.OPEN, ConversationStatus.PENDING_AGENT],
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    if (!conversation) return;

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: SenderType.BOT,
        content,
        metaMessageId: messageId,
        templateName,
        deliveryStatus: DeliveryStatus.SENT,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    });
    this.inboxEvents.emit('message.created', {
      conversationId: conversation.id,
      message,
    });
    this.inboxEvents.emit('conversation.updated', {
      conversationId: conversation.id,
    });
  }

  private async markSentWriteFailed(
    id: string,
    messageId: string | null,
  ): Promise<void> {
    await this.prisma.appointmentReminder.update({
      where: { id },
      data: {
        status: ReminderStatus.FAILED,
        messageId,
        error: `Meta kabul etti, durum kaydedilemedi (mesaj ${messageId ?? '-'}). Tekrar denemeden önce mesajı kontrol edin.`,
      },
    });
  }

  private async retryOrFail(
    id: string,
    attempts: number,
    error: string,
    now: Date,
  ): Promise<void> {
    if (attempts < REMINDER_MAX_ATTEMPTS) {
      await this.prisma.appointmentReminder.update({
        where: { id },
        data: {
          status: ReminderStatus.PENDING,
          attempts,
          scheduledFor: new Date(now.getTime() + REMINDER_RETRY_DELAY_MS),
          error,
        },
      });
      return;
    }
    await this.prisma.appointmentReminder.update({
      where: { id },
      data: { status: ReminderStatus.FAILED, attempts, error },
    });
  }

  private async setPending(id: string): Promise<void> {
    await this.prisma.appointmentReminder.update({
      where: { id },
      data: { status: ReminderStatus.PENDING },
    });
  }

  private async setStatus(
    id: string,
    status: ReminderStatus,
    error: string,
  ): Promise<void> {
    await this.prisma.appointmentReminder.update({
      where: { id },
      data: { status, error },
    });
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
