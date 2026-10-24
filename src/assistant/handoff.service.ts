import { Injectable } from '@nestjs/common';
import { ConversationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

export type HandoffReason =
  | 'randevu_degisiklik'
  | 'paket_sorusu'
  | 'sikayet'
  | 'yetkili_talebi'
  | 'konum_idari'
  | 'bilinmeyen_konu'
  | 'acil_durum';

@Injectable()
export class HandoffService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private inboxEvents: InboxEventsService,
  ) {}

  async handoff(
    conversationId: string,
    reason: HandoffReason,
    // Elif'in devir özeti henüz saklanmıyor; inbox'ta gösterilmesi ayrı iş.
    _summary: string,
  ): Promise<void> {
    const isCrisis = reason === 'acil_durum';

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        isBotActive: false,
        status: ConversationStatus.PENDING_AGENT,
        ...(isCrisis ? { flaggedCrisis: true } : {}),
      },
    });

    this.inboxEvents.emit('conversation.updated', { conversationId });
    this.inboxEvents.emit('counts.changed', {});

    const type: NotificationType = isCrisis ? 'DANGER_PANIC' : 'WARNING';
    await this.notifications
      .notifyAdmins(type, `Asistan devri: ${reason}`)
      .catch(() => {});
  }
}
