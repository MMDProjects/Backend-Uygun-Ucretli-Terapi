import { Injectable } from '@nestjs/common';
import { ConversationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { CrisisAlertService } from './crisis-alert.service';

export type HandoffReason =
  | 'randevu_degisiklik'
  | 'paket_sorusu'
  | 'sikayet'
  | 'yetkili_talebi'
  | 'konum_idari'
  | 'bilinmeyen_konu'
  | 'acil_durum'
  | 'uzman_ekip';

export const REASON_LABELS: Record<HandoffReason, string> = {
  randevu_degisiklik: 'Randevu değişikliği',
  paket_sorusu: 'Paket sorusu',
  sikayet: 'Şikayet',
  yetkili_talebi: 'Yetkili talebi',
  konum_idari: 'Konum/idari',
  bilinmeyen_konu: 'Bilinmeyen konu',
  acil_durum: 'Acil durum',
  uzman_ekip: 'Uzman / iç ekip',
};

const MAX_SUMMARY_CHARS = 1000;
const NOTIFY_SUMMARY_CHARS = 120;

@Injectable()
export class HandoffService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private inboxEvents: InboxEventsService,
    private crisisAlert: CrisisAlertService,
  ) {}

  async handoff(
    conversationId: string,
    reason: HandoffReason,
    summary: string,
  ): Promise<void> {
    const isCrisis = reason === 'acil_durum';
    const trimmed = summary.trim();
    const savedSummary = trimmed ? trimmed.slice(0, MAX_SUMMARY_CHARS) : null;

    const conversation = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        isBotActive: false,
        status: ConversationStatus.PENDING_AGENT,
        handoffReason: reason,
        handoffSummary: savedSummary,
        handedOffAt: new Date(),
        ...(isCrisis ? { flaggedCrisis: true } : {}),
      },
      include: {
        contact: { select: { fullName: true, phone: true, instagramId: true } },
      },
    });

    this.inboxEvents.emit('conversation.updated', { conversationId });
    this.inboxEvents.emit('counts.changed', {});

    if (isCrisis) {
      await this.crisisAlert.alert(conversationId, 'handoff');
    }

    const contact = conversation?.contact;
    const who =
      contact?.fullName ??
      contact?.phone ??
      contact?.instagramId ??
      'Bilinmeyen kişi';
    const shortSummary = trimmed.slice(0, NOTIFY_SUMMARY_CHARS);
    const message = `Asistan devri (${REASON_LABELS[reason]}): ${who}${
      shortSummary ? ` — ${shortSummary}` : ''
    }`;

    const type: NotificationType = isCrisis ? 'DANGER_PANIC' : 'WARNING';
    await this.notifications.notifyAdmins(type, message).catch(() => {});
  }
}
