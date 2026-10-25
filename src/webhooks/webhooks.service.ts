import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  Channel,
  ConversationStatus,
  SenderType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { AssistantSettingsService } from '../assistant/assistant-settings.service';
import { containsCrisisLanguage } from './crisis-keywords';
import { detectContactType } from './contact-type.util';
import { InstagramProfileService } from './instagram-profile.service';
import {
  MetaWebhookBody,
  MetaWhatsAppChange,
  MetaInstagramMessagingEvent,
} from './dto/meta-webhook-payload.dto';

export const UNSUPPORTED_PREFIX = '[desteklenmeyen mesaj tipi';

export type MessageKind = 'text' | 'unsupported';

export interface ProcessedIncomingMessage {
  conversationId: string;
  isNew: boolean;
  crisis: boolean;
  // Konuşma bu mesajla ilk kez kriz işareti aldıysa true.
  crisisNew: boolean;
  kind: MessageKind;
  messageId: string | null;
  // Instagram bekleme modundan (standby) geldiyse true: Elif yalnızca taslak üretir.
  standby: boolean;
}

interface NormalizedIncomingMessage {
  channel: Channel;
  externalContactId: string; // WhatsApp: wa_id/from, Instagram: sender.id
  contactName?: string;
  metaMessageId: string;
  content: string;
  kind: MessageKind;
  timestamp: Date;
  standby?: boolean;
}

// Instagram'da işletmeden çıkan mesajın kopyası (is_echo).
export interface InstagramEcho {
  externalContactId: string; // recipient.id: danışan
  metaMessageId: string;
  content: string;
  // Bekleme modunda (standby) gelen kopya; konuşma devralınmaz.
  standby?: boolean;
}

const ECHO_RECHECK_MS = 5000;
const ECHO_MATCH_WINDOW_MS = 60000;
const DEFAULT_CRISIS_LOCK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxEvents: InboxEventsService,
    private readonly config: ConfigService,
    private readonly settings: AssistantSettingsService,
    private readonly instagramProfile: InstagramProfileService,
  ) {}

  extractMessages(body: MetaWebhookBody): NormalizedIncomingMessage[] {
    const result: NormalizedIncomingMessage[] = [];
    for (const entry of body.entry ?? []) {
      if (entry.changes) {
        result.push(...this.extractWhatsAppMessages(entry.changes));
      }
      if (entry.messaging) {
        result.push(...this.extractInstagramMessages(entry.messaging));
      }
      if (entry.standby) {
        result.push(...this.extractInstagramMessages(entry.standby, true));
      }
    }
    return result;
  }

  extractInstagramEchoes(body: MetaWebhookBody): InstagramEcho[] {
    const result: InstagramEcho[] = [];
    for (const entry of body.entry ?? []) {
      const sources: [MetaInstagramMessagingEvent[] | undefined, boolean][] = [
        [entry.messaging, false],
        [entry.standby, true],
      ];
      for (const [events, standby] of sources) {
        for (const event of events ?? []) {
          if (!event.message?.is_echo) continue;
          result.push({
            externalContactId: event.recipient.id,
            metaMessageId: event.message.mid,
            content: event.message.text || `${UNSUPPORTED_PREFIX}]`,
            ...(standby ? { standby: true } : {}),
          });
        }
      }
    }
    return result;
  }

  private extractWhatsAppMessages(
    changes: MetaWhatsAppChange[],
  ): NormalizedIncomingMessage[] {
    const result: NormalizedIncomingMessage[] = [];
    for (const change of changes) {
      const contactsByWaId = new Map(
        (change.value.contacts ?? []).map((c) => [c.wa_id, c.profile.name]),
      );
      for (const m of change.value.messages ?? []) {
        const text = m.type === 'text' ? m.text?.body : undefined;
        result.push({
          channel: Channel.WHATSAPP,
          externalContactId: m.from,
          contactName: contactsByWaId.get(m.from),
          metaMessageId: m.id,
          content: text || `${UNSUPPORTED_PREFIX}: ${m.type}]`,
          kind: text ? 'text' : 'unsupported',
          timestamp: new Date(Number(m.timestamp) * 1000),
        });
      }
    }
    return result;
  }

  private extractInstagramMessages(
    events: MetaInstagramMessagingEvent[],
    standby = false,
  ): NormalizedIncomingMessage[] {
    const result: NormalizedIncomingMessage[] = [];
    for (const event of events) {
      // is_echo kopyaları ayrı işlenir (bkz. extractInstagramEchoes).
      if (!event.message || event.message.is_echo) continue;
      const text = event.message.text;
      result.push({
        channel: Channel.INSTAGRAM,
        externalContactId: event.sender.id,
        metaMessageId: event.message.mid,
        content: text || `${UNSUPPORTED_PREFIX}]`,
        kind: text ? 'text' : 'unsupported',
        timestamp: new Date(event.timestamp),
        ...(standby ? { standby: true } : {}),
      });
    }
    return result;
  }

  detectCrisis(text: string): boolean {
    return containsCrisisLanguage(text);
  }

  async processIncomingMessage(
    msg: NormalizedIncomingMessage,
  ): Promise<ProcessedIncomingMessage | null> {
    const { contact, created: contactCreated } = await this.upsertContact(msg);
    const conversation = await this.upsertOpenConversation(
      contact.id,
      msg.channel,
    );
    if (contactCreated && msg.channel === Channel.INSTAGRAM) {
      this.enrichInstagramName(
        contact.id,
        conversation.id,
        msg.externalContactId,
      );
    }

    const standby = msg.standby === true;
    let created: { id: string };
    try {
      created = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: SenderType.CLIENT,
          content: msg.content,
          metaMessageId: msg.metaMessageId,
        },
      });
    } catch (err) {
      if (this.isDuplicateMessage(err)) {
        this.logger.warn(
          `Duplicate metaMessageId atlandı: ${msg.metaMessageId}`,
        );
        return {
          conversationId: conversation.id,
          isNew: false,
          crisis: false,
          crisisNew: false,
          kind: msg.kind,
          messageId: null,
          standby,
        };
      }
      // Idempotency dışındaki hatalar yutulmaz — 500 döner, Meta retry eder.
      throw err;
    }

    const crisis = this.detectCrisis(msg.content);
    const crisisNew = crisis && !conversation.flaggedCrisis;
    const now = new Date();
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: crisis
        ? {
            lastMessageAt: now,
            isBotActive: false,
            status: ConversationStatus.PENDING_AGENT,
            flaggedCrisis: true,
            handoffReason: 'acil_durum',
            handoffSummary: 'Mesajda kriz ifadesi tespit edildi',
            handedOffAt: now,
          }
        : { lastMessageAt: now },
    });

    if (crisis) {
      this.logger.warn(
        `Kriz ifadesi tespit edildi, conversation=${conversation.id}`,
      );
      this.inboxEvents.emit('conversation.updated', {
        conversationId: conversation.id,
      });
      this.inboxEvents.emit('counts.changed', {});
    }

    this.inboxEvents.emit('message.created', {
      conversationId: conversation.id,
      message: created,
    });

    return {
      conversationId: conversation.id,
      isNew: true,
      crisis,
      crisisNew,
      kind: msg.kind,
      messageId: created.id,
      standby,
    };
  }

  // Instagram uygulamasından (telefon) giden ve bizim kaydımızda olmayan
  // mesajları işler: kayıtlıysa atlar, eşleşmeyi bulursa kimliği bağlar,
  // yoksa personel mesajı olarak kaydedip konuşmayı devralır.
  async processInstagramEcho(echo: InstagramEcho): Promise<void> {
    if (await this.isKnownMessage(echo.metaMessageId)) return;

    // Gönderim kaydı henüz yazılmamış olabilir (yarış durumu).
    await new Promise((resolve) => setTimeout(resolve, ECHO_RECHECK_MS));
    if (await this.isKnownMessage(echo.metaMessageId)) return;

    const { contact, created: contactCreated } = await this.upsertContact({
      channel: Channel.INSTAGRAM,
      externalContactId: echo.externalContactId,
    });
    const conversation = await this.upsertOpenConversation(
      contact.id,
      Channel.INSTAGRAM,
    );
    if (contactCreated) {
      this.enrichInstagramName(
        contact.id,
        conversation.id,
        echo.externalContactId,
      );
    }
    if (await this.linkEchoToRecentMessage(conversation.id, echo)) return;

    // Gölge modda ya da bekleme kopyasında konuşma devralınmaz; eski bot
    // ya da personel cevabı yalnızca kaydedilir.
    const keepBot =
      echo.standby === true ||
      (await this.settings.getEffectiveMode()) === 'SHADOW';

    let created: { id: string };
    try {
      created = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: SenderType.AGENT,
          agentUserId: null,
          externalSource: 'instagram_app',
          content: echo.content,
          metaMessageId: echo.metaMessageId,
        },
      });
    } catch (err) {
      if (this.isDuplicateMessage(err)) return;
      throw err;
    }

    if (keepBot) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
      this.inboxEvents.emit('message.created', {
        conversationId: conversation.id,
        message: created,
      });
      this.inboxEvents.emit('conversation.updated', {
        conversationId: conversation.id,
      });
      return;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        isBotActive: false,
        status: ConversationStatus.PENDING_AGENT,
      },
    });
    this.logger.warn(
      `Sistem dışı Instagram mesajı, konuşma devralındı: conversation=${conversation.id}`,
    );
    this.inboxEvents.emit('message.created', {
      conversationId: conversation.id,
      message: created,
    });
    this.inboxEvents.emit('conversation.updated', {
      conversationId: conversation.id,
    });
    this.inboxEvents.emit('counts.changed', {});
  }

  private async isKnownMessage(metaMessageId: string): Promise<boolean> {
    const found = await this.prisma.message.findUnique({
      where: { metaMessageId },
      select: { id: true },
    });
    return !!found;
  }

  // Son dakikada aynı metinle kaydedilmiş, kimliği boş bir bot/personel
  // mesajı varsa kimliği bu echo'ya bağlar.
  private async linkEchoToRecentMessage(
    conversationId: string,
    echo: InstagramEcho,
  ): Promise<boolean> {
    const candidate = await this.prisma.message.findFirst({
      where: {
        conversationId,
        senderType: { in: [SenderType.BOT, SenderType.AGENT] },
        content: echo.content,
        metaMessageId: null,
        createdAt: { gte: new Date(Date.now() - ECHO_MATCH_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!candidate) return false;

    try {
      await this.prisma.message.update({
        where: { id: candidate.id },
        data: { metaMessageId: echo.metaMessageId },
      });
    } catch (err) {
      if (this.isDuplicateMessage(err)) return true;
      throw err;
    }
    return true;
  }

  // Yeni kişi oluşturulduysa created true döner.
  private async upsertContact(
    msg: Pick<
      NormalizedIncomingMessage,
      'channel' | 'externalContactId' | 'contactName'
    >,
  ): Promise<{ contact: { id: string }; created: boolean }> {
    const where =
      msg.channel === Channel.WHATSAPP
        ? { phone: msg.externalContactId }
        : { instagramId: msg.externalContactId };
    const existing = await this.prisma.contact.findFirst({ where });
    if (existing) {
      const contact = await this.prisma.contact.update({
        where: { id: existing.id },
        data: { lastActiveAt: new Date() },
      });
      return { contact, created: false };
    }

    // Yalnızca yeni WhatsApp kişisinde otomatik tanıma yapılır.
    const contactType =
      msg.channel === Channel.WHATSAPP
        ? await detectContactType(this.prisma, msg.externalContactId)
        : undefined;
    const contact = await this.prisma.contact.create({
      data: {
        ...where,
        fullName: msg.contactName,
        channel: msg.channel,
        ...(contactType ? { contactType } : {}),
      },
    });
    return { contact, created: true };
  }

  // Yeni Instagram kişisinin profil adını arka planda yazar. Ad hâlâ boşsa
  // günceller; hata olursa sessizce geçer, webhook yanıtını bekletmez.
  private enrichInstagramName(
    contactId: string,
    conversationId: string,
    igsid: string,
  ): void {
    void this.instagramProfile
      .fetchName(igsid)
      .then(async (name) => {
        if (!name) return;
        const result = await this.prisma.contact.updateMany({
          where: { id: contactId, fullName: null },
          data: { fullName: name },
        });
        if (result.count > 0) {
          this.inboxEvents.emit('conversation.updated', { conversationId });
        }
      })
      .catch((err) =>
        this.logger.warn(
          `Instagram danışan adı yazılamadı: ${(err as Error)?.name ?? 'hata'}`,
        ),
      );
  }

  // Kapanmamış (OPEN veya PENDING_AGENT) en son konuşmayı kullanır. Yoksa
  // yeni açar; kişinin son günlerde kriz işaretli konuşması varsa yenisi
  // bot kapalı ve personel bekliyor olarak başlar.
  private async upsertOpenConversation(contactId: string, channel: Channel) {
    const active = await this.prisma.conversation.findFirst({
      where: {
        contactId,
        channel,
        status: {
          in: [ConversationStatus.OPEN, ConversationStatus.PENDING_AGENT],
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (active) return active;

    const since = new Date(Date.now() - this.crisisLockDays() * DAY_MS);
    const flagged = await this.prisma.conversation.findFirst({
      where: { contactId, flaggedCrisis: true, lastMessageAt: { gte: since } },
      select: { id: true },
    });
    if (flagged) {
      return this.prisma.conversation.create({
        data: {
          contactId,
          channel,
          isBotActive: false,
          status: ConversationStatus.PENDING_AGENT,
          flaggedCrisis: true,
          handoffReason: 'acil_durum',
          handoffSummary: 'Önceki konuşmada kriz işareti vardı',
          handedOffAt: new Date(),
        },
      });
    }
    return this.prisma.conversation.create({ data: { contactId, channel } });
  }

  private crisisLockDays(): number {
    const raw = this.config.get<string>('ASSISTANT_CRISIS_LOCK_DAYS');
    const days = raw ? Number(raw) : DEFAULT_CRISIS_LOCK_DAYS;
    return Number.isFinite(days) && days >= 0 ? days : DEFAULT_CRISIS_LOCK_DAYS;
  }

  private isDuplicateMessage(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }
}
