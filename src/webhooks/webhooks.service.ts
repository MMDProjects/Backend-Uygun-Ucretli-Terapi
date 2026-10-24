import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Channel, SenderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { containsCrisisLanguage } from './crisis-keywords';
import {
  MetaWebhookBody,
  MetaWhatsAppChange,
  MetaInstagramMessagingEvent,
} from './dto/meta-webhook-payload.dto';

export interface ProcessedIncomingMessage {
  conversationId: string;
  isNew: boolean;
  crisis: boolean;
  messageId: string | null;
}

interface NormalizedIncomingMessage {
  channel: Channel;
  externalContactId: string; // WhatsApp: wa_id/from, Instagram: sender.id
  contactName?: string;
  metaMessageId: string;
  content: string;
  timestamp: Date;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxEvents: InboxEventsService,
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
        result.push({
          channel: Channel.WHATSAPP,
          externalContactId: m.from,
          contactName: contactsByWaId.get(m.from),
          metaMessageId: m.id,
          content:
            m.type === 'text' && m.text
              ? m.text.body
              : `[desteklenmeyen mesaj tipi: ${m.type}]`,
          timestamp: new Date(Number(m.timestamp) * 1000),
        });
      }
    }
    return result;
  }

  private extractInstagramMessages(
    events: MetaInstagramMessagingEvent[],
  ): NormalizedIncomingMessage[] {
    const result: NormalizedIncomingMessage[] = [];
    for (const event of events) {
      // is_echo: işletmenin/botun kendi gönderdiği mesajın webhook'a
      // yansıması — tekrar CLIENT mesajı olarak kaydedilmemeli.
      if (!event.message || event.message.is_echo) continue;
      result.push({
        channel: Channel.INSTAGRAM,
        externalContactId: event.sender.id,
        metaMessageId: event.message.mid,
        content: event.message.text ?? '[desteklenmeyen mesaj tipi]',
        timestamp: new Date(event.timestamp),
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
    const contact = await this.upsertContact(msg);
    const conversation = await this.upsertOpenConversation(
      contact.id,
      msg.channel,
    );

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
          messageId: null,
        };
      }
      // Idempotency dışındaki hatalar yutulmaz — 500 döner, Meta retry eder.
      throw err;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    const crisis = this.detectCrisis(msg.content);
    if (crisis) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { isBotActive: false, flaggedCrisis: true },
      });
      this.logger.warn(
        `Kriz ifadesi tespit edildi, conversation=${conversation.id}`,
      );
    }

    this.inboxEvents.emit('message.created', {
      conversationId: conversation.id,
      message: created,
    });

    return {
      conversationId: conversation.id,
      isNew: true,
      crisis,
      messageId: created.id,
    };
  }

  private async upsertContact(msg: NormalizedIncomingMessage) {
    const where =
      msg.channel === Channel.WHATSAPP
        ? { phone: msg.externalContactId }
        : { instagramId: msg.externalContactId };
    const existing = await this.prisma.contact.findFirst({ where });
    if (existing) {
      return this.prisma.contact.update({
        where: { id: existing.id },
        data: { lastActiveAt: new Date() },
      });
    }
    return this.prisma.contact.create({
      data: {
        ...where,
        fullName: msg.contactName,
        channel: msg.channel,
      },
    });
  }

  private async upsertOpenConversation(contactId: string, channel: Channel) {
    const existing = await this.prisma.conversation.findFirst({
      where: { contactId, channel, status: 'OPEN' },
    });
    if (existing) return existing;
    return this.prisma.conversation.create({ data: { contactId, channel } });
  }

  private isDuplicateMessage(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }
}
