import { Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  DeliveryStatus,
  Prisma,
  RecipientStatus,
  ReminderStatus,
  SenderType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { MetaSenderService } from './meta-sender.service';
import { isOptOutMessage } from '../messaging/opt-out';
import {
  ForwardStatus,
  canAdvance,
  describeMetaError,
  mapMetaStatus,
} from './delivery-status';
import { refreshCampaignCounts } from '../messaging/campaigns/campaign-counts';
import {
  MetaInstagramMessagingEvent,
  MetaWhatsAppStatus,
} from './dto/meta-webhook-payload.dto';
import type { MessageKind } from './webhooks.service';

export const OPT_OUT_CONFIRMATION =
  'Tamam, size artık otomatik bilgilendirme mesajı göndermeyeceğiz.';
const REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;
const STATUS_RETRY_DELAY_MS = 3000;
const READ_BATCH_SIZE = 500;
const REPLIED_FROM: RecipientStatus[] = [
  RecipientStatus.SENT,
  RecipientStatus.DELIVERED,
  RecipientStatus.READ,
];

export interface InboundFollowupInput {
  conversationId: string;
  text: string;
  kind: MessageKind;
  senderId: string;
  standby: boolean;
}

// Mesaj durumu, hatırlatma, kampanya alıcısı, okuma ve DUR işlemleri.
// Webhook'tan çağrılır; hatalar çağıran tarafta yutulur.
@Injectable()
export class WebhookFollowupService {
  private readonly logger = new Logger(WebhookFollowupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxEvents: InboxEventsService,
    private readonly metaSender: MetaSenderService,
  ) {}

  // WhatsApp value.statuses[] olaylarını işler.
  async applyWhatsAppStatuses(statuses: MetaWhatsAppStatus[]): Promise<void> {
    for (const status of statuses) {
      const target = mapMetaStatus(status.status);
      if (!target || !status.id) continue;
      const at = parseMetaSeconds(status.timestamp);
      const error =
        target === 'FAILED' ? describeMetaError(status.errors) : null;
      await this.applyStatusEvent(status.id, target, at, error, true);
    }
  }

  // Bir Meta durumunu mesaj, hatırlatma ve kampanya alıcısına uygular. Hiçbir
  // kayıt eşleşmezse (kayıt henüz yazılmamış olabilir) bir kez daha denenir.
  private async applyStatusEvent(
    metaMessageId: string,
    target: ForwardStatus,
    at: Date,
    error: string | null,
    retryIfMissing: boolean,
  ): Promise<void> {
    const messageFound = await this.applyMessageStatus(
      metaMessageId,
      target,
      at,
      error,
    );
    const reminderFound = await this.applyReminderStatus(
      metaMessageId,
      target,
      error,
    );
    const recipientFound = await this.applyRecipientStatus(
      metaMessageId,
      target,
      error,
    );
    if (retryIfMissing && !messageFound && !reminderFound && !recipientFound) {
      this.scheduleStatusRetry(metaMessageId, target, at, error);
    }
  }

  // Instagram okuma bildirimi: danışanın konuşmasındaki, okunma anından önce
  // giden personel ve bot mesajları READ olur (en iyi çaba).
  async applyInstagramRead(event: MetaInstagramMessagingEvent): Promise<void> {
    if (!event.read) return;
    const contact = await this.prisma.contact.findFirst({
      where: { instagramId: event.sender.id },
      select: { id: true },
    });
    if (!contact) return;

    const upTo = await this.readUpTo(event);
    const conversations = await this.prisma.conversation.findMany({
      where: { contactId: contact.id, channel: Channel.INSTAGRAM },
      select: { id: true },
    });
    const conversationIds = conversations.map((c) => c.id);
    if (conversationIds.length === 0) return;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: { in: conversationIds },
        senderType: { in: [SenderType.AGENT, SenderType.BOT] },
        isDraft: false,
        createdAt: { lte: upTo },
        ...sentOrUnset(),
      },
      select: { id: true, conversationId: true },
      orderBy: { createdAt: 'asc' },
      take: READ_BATCH_SIZE,
    });
    if (messages.length === 0) return;

    await this.prisma.message.updateMany({
      where: { id: { in: messages.map((m) => m.id) }, ...sentOrUnset() },
      data: { deliveryStatus: DeliveryStatus.READ, readAt: new Date() },
    });
    for (const message of messages) {
      this.inboxEvents.emit('message.updated', {
        conversationId: message.conversationId,
        messageId: message.id,
        deliveryStatus: DeliveryStatus.READ,
      });
    }
  }

  // Okunan son an: önce watermark (ms), yoksa okunan mesajın (mid) zamanı,
  // o da yoksa olayın zamanı. Meta alanı gelmezse en kaba tahmin kullanılır.
  private async readUpTo(event: MetaInstagramMessagingEvent): Promise<Date> {
    const now = Date.now();
    const watermark = event.read?.watermark;
    if (typeof watermark === 'number' && Number.isFinite(watermark)) {
      return new Date(Math.min(watermark, now));
    }
    const mid = event.read?.mid;
    if (mid) {
      const read = await this.prisma.message.findUnique({
        where: { metaMessageId: mid },
        select: { createdAt: true },
      });
      if (read) return new Date(Math.min(read.createdAt.getTime(), now));
    }
    const at = Number.isFinite(event.timestamp) ? event.timestamp : now;
    return new Date(Math.min(at, now));
  }

  // Gelen mesajın takip işlemleri: 72 saat içinde kampanya yanıtı (REPLIED)
  // ve DUR. Döner: mesaj DUR ise true; asistan bu mesaja cevap vermez.
  async handleInboundMessage(input: InboundFollowupInput): Promise<boolean> {
    const optOut = input.kind === 'text' && isOptOutMessage(input.text);
    let channel: Channel | null = null;
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: { contactId: true, channel: true },
      });
      if (conversation) {
        channel = conversation.channel;
        // Kampanyalar yalnızca WhatsApp'tır; Instagram yanıtı sayılmaz.
        if (channel === Channel.WHATSAPP) {
          await this.markReplied(conversation.contactId);
        }
        if (optOut) {
          await this.applyOptOut(conversation.contactId);
        }
      }
    } catch (err) {
      this.logger.error('Gelen mesaj takip işlemi başarısız', err as Error);
    }

    if (optOut && channel && !input.standby) {
      await this.sendOptOutConfirmation(
        input.conversationId,
        channel,
        input.senderId,
      );
    }
    return optOut;
  }

  // Meta durumu, kaydın yazılmasından önce gelebilir. Bir kez, gecikmeli denenir.
  private scheduleStatusRetry(
    metaMessageId: string,
    target: ForwardStatus,
    at: Date,
    error: string | null,
  ): void {
    const timer = setTimeout(() => {
      this.applyStatusEvent(metaMessageId, target, at, error, false).catch(
        (err: unknown) =>
          this.logger.error(
            'Mesaj durumu yeniden denemesi başarısız',
            err as Error,
          ),
      );
    }, STATUS_RETRY_DELAY_MS);
    timer.unref?.();
  }

  // Dönüş: mesaj kaydı bulunduysa true.
  private async applyMessageStatus(
    metaMessageId: string,
    target: ForwardStatus,
    at: Date,
    error: string | null,
  ): Promise<boolean> {
    const message = await this.prisma.message.findUnique({
      where: { metaMessageId },
      select: { id: true, conversationId: true, deliveryStatus: true },
    });
    if (!message) return false;
    if (!canAdvance(message.deliveryStatus, target)) return true;

    const data: Prisma.MessageUpdateManyMutationInput = {
      deliveryStatus: target,
    };
    if (target === 'DELIVERED') data.deliveredAt = at;
    if (target === 'READ') data.readAt = at;
    if (target === 'FAILED') data.deliveryError = error;

    const result = await this.prisma.message.updateMany({
      where: { id: message.id, deliveryStatus: message.deliveryStatus },
      data,
    });
    if (result.count > 0) {
      this.inboxEvents.emit('message.updated', {
        conversationId: message.conversationId,
        messageId: message.id,
        deliveryStatus: target,
      });
    }
    return true;
  }

  // Hatırlatma mesajı Meta tarafında başarısız olursa kayıt da FAILED olur.
  // Dönüş: eşleşen hatırlatma kaydı bulunduysa true.
  private async applyReminderStatus(
    metaMessageId: string,
    target: ForwardStatus,
    error: string | null,
  ): Promise<boolean> {
    if (target !== 'FAILED') return false;
    const result = await this.prisma.appointmentReminder.updateMany({
      where: {
        messageId: metaMessageId,
        status: { in: [ReminderStatus.SENT, ReminderStatus.SENDING] },
      },
      data: { status: ReminderStatus.FAILED, error },
    });
    return result.count > 0;
  }

  // Dönüş: eşleşen kampanya alıcısı bulunduysa true.
  private async applyRecipientStatus(
    metaMessageId: string,
    target: ForwardStatus,
    error: string | null,
  ): Promise<boolean> {
    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { messageId: metaMessageId },
      select: { id: true, campaignId: true, status: true },
    });
    const changed = new Set<string>();
    for (const recipient of recipients) {
      if (!canAdvance(recipient.status, target)) continue;
      const result = await this.prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, status: recipient.status },
        data: {
          status: target,
          ...(target === 'FAILED' ? { error } : {}),
        },
      });
      if (result.count > 0) changed.add(recipient.campaignId);
    }
    await this.refreshCampaigns(changed);
    return recipients.length > 0;
  }

  // DUR: kişinin otomatik mesajları kapanır, bekleyen hatırlatmalar iptal
  // edilir, bekleyen kampanya alıcıları atlanır.
  private async applyOptOut(contactId: string): Promise<void> {
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        reminderOptOut: true,
        marketingOptOut: true,
        optOutAt: new Date(),
      },
    });
    await this.prisma.appointmentReminder.updateMany({
      where: {
        status: ReminderStatus.PENDING,
        appointment: { contactId },
      },
      data: { status: ReminderStatus.CANCELLED },
    });

    const pending = await this.prisma.campaignRecipient.findMany({
      where: { contactId, status: RecipientStatus.PENDING },
      select: { id: true, campaignId: true },
    });
    const changed = new Set<string>();
    for (const row of pending) {
      const result = await this.prisma.campaignRecipient.updateMany({
        where: { id: row.id, status: RecipientStatus.PENDING },
        data: { status: RecipientStatus.SKIPPED, skipReason: 'opt_out' },
      });
      if (result.count > 0) changed.add(row.campaignId);
    }
    await this.refreshCampaigns(changed);
  }

  // 72 saat içinde iletilmiş ya da okunmuş kampanya mesajına yanıt gelirse
  // alıcı REPLIED olur.
  private async markReplied(contactId: string): Promise<void> {
    const since = new Date(Date.now() - REPLY_WINDOW_MS);
    const recipients = await this.prisma.campaignRecipient.findMany({
      where: {
        contactId,
        status: { in: REPLIED_FROM },
        sentAt: { gte: since },
      },
      select: { id: true, campaignId: true },
    });
    const changed = new Set<string>();
    for (const recipient of recipients) {
      const result = await this.prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, status: { in: REPLIED_FROM } },
        data: { status: RecipientStatus.REPLIED },
      });
      if (result.count > 0) changed.add(recipient.campaignId);
    }
    await this.refreshCampaigns(changed);
  }

  // Sayaçlar her değişiklikte alıcılardan yeniden hesaplanır; artırma ile
  // birikmez, böylece tamamlanmış kampanyalar da doğru kalır.
  private async refreshCampaigns(campaignIds: Set<string>): Promise<void> {
    for (const campaignId of campaignIds) {
      await refreshCampaignCounts(this.prisma, campaignId);
    }
  }

  private async sendOptOutConfirmation(
    conversationId: string,
    channel: Channel,
    recipientId: string,
  ): Promise<void> {
    try {
      const res = await this.metaSender.sendText(
        channel,
        recipientId,
        OPT_OUT_CONFIRMATION,
      );
      if (!res.ok) return;
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          senderType: SenderType.BOT,
          content: OPT_OUT_CONFIRMATION,
          metaMessageId: res.messageId ?? null,
          // Diğer bot mesajları gibi: Meta kimliği varsa gönderildi.
          deliveryStatus: res.messageId ? DeliveryStatus.SENT : null,
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.createdAt },
      });
      this.inboxEvents.emit('message.created', { conversationId, message });
      this.inboxEvents.emit('conversation.updated', { conversationId });
    } catch (err) {
      this.logger.error('DUR onay mesajı gönderilemedi', err as Error);
    }
  }
}

// Gönderildi ya da henüz durumu bilinmeyen mesajlar (okuma için).
function sentOrUnset(): Prisma.MessageWhereInput {
  return {
    OR: [
      { deliveryStatus: null },
      {
        deliveryStatus: { in: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED] },
      },
    ],
  };
}

function parseMetaSeconds(value: string | undefined): Date {
  const seconds = Number(value);
  return value && Number.isFinite(seconds)
    ? new Date(seconds * 1000)
    : new Date();
}
