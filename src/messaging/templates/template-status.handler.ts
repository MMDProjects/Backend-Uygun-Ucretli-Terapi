import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, TemplateStatus } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { mapTemplateEvent, reasonOrNull } from './template-mapping';

// Meta message_template_status_update webhook değeri.
export interface TemplateStatusValue {
  event?: string;
  message_template_id?: number | string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string | null;
}

// Bu durumlarda yöneticiler uyarılır.
const ALERT_STATUSES: ReadonlySet<TemplateStatus> = new Set([
  TemplateStatus.REJECTED,
  TemplateStatus.PAUSED,
  TemplateStatus.DISABLED,
]);

@Injectable()
export class TemplateStatusHandler {
  private readonly logger = new Logger(TemplateStatusHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async handle(value: TemplateStatusValue): Promise<void> {
    const status = mapTemplateEvent(value.event);
    if (!status) {
      this.logger.debug(
        `Şablon durum olayı yok sayıldı: ${value.event ?? '-'}`,
      );
      return;
    }

    const template = await this.findTemplate(value);
    if (!template) {
      this.logger.warn(
        `Şablon durum olayı için kayıt bulunamadı: ${value.message_template_name ?? value.message_template_id ?? '-'}`,
      );
      return;
    }

    const reason = reasonOrNull(value.reason);
    const rejectedReason =
      status === TemplateStatus.APPROVED || status === TemplateStatus.PENDING
        ? null
        : reason;
    await this.prisma.whatsAppTemplate.update({
      where: { id: template.id },
      data: { status, rejectedReason },
    });

    if (ALERT_STATUSES.has(status)) {
      await this.alertAdmins(template.name, status, rejectedReason);
    }
  }

  // Önce Meta kimliğiyle, olmazsa ad + dil ile arar.
  private async findTemplate(
    value: TemplateStatusValue,
  ): Promise<{ id: string; name: string } | null> {
    const select = { id: true, name: true } as const;
    if (
      value.message_template_id !== undefined &&
      value.message_template_id !== null
    ) {
      const byMeta = await this.prisma.whatsAppTemplate.findUnique({
        where: { metaId: String(value.message_template_id) },
        select,
      });
      if (byMeta) {
        return byMeta;
      }
    }
    if (value.message_template_name && value.message_template_language) {
      return this.prisma.whatsAppTemplate.findUnique({
        where: {
          name_language: {
            name: value.message_template_name,
            language: value.message_template_language,
          },
        },
        select,
      });
    }
    return null;
  }

  private async alertAdmins(
    name: string,
    status: TemplateStatus,
    reason: string | null,
  ): Promise<void> {
    const detail = reason ? `: ${reason}` : '';
    try {
      await this.notifications.notifyAdmins(
        NotificationType.WARNING,
        `WhatsApp şablonu "${name}" durumu ${status}${detail}`,
      );
    } catch (err) {
      this.logger.error(
        'Şablon uyarısı yöneticilere iletilemedi',
        err as Error,
      );
    }
  }
}
