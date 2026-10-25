import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Channel,
  ConversationStatus,
  LeadStatus,
  Prisma,
  Role,
  SenderType,
  UnansweredStatus,
} from '@prisma/client';
import { Observable, map } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { ConversationSummaryService } from '../assistant/conversation-summary.service';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = DAY_MS;
const HUMAN_AGENT_WINDOW_MS = 7 * DAY_MS;
const WINDOW_CLOSED_MESSAGE =
  'Mesajlaşma penceresi kapandı; danışan yeniden yazana kadar serbest mesaj gönderilemez.';
const CRISIS_HANDBACK_MESSAGE = 'Kriz işaretli konuşma Elif’e geri verilemez.';
const SEND_FAILED_MESSAGE = 'Mesaj Meta’ya iletilemedi.';
const CLOSED_CONVERSATION_MESSAGE = 'Kapalı konuşmaya mesaj gönderilemez.';
const DEFAULT_INSTAGRAM_MAX_CHARS = 1000;
const SEARCH_LIMIT = 50;
const SNIPPET_RADIUS = 60;

const AGENT_SELECT = { select: { firstName: true, lastName: true } } as const;
const ASSIGNEE_SELECT = {
  select: { id: true, firstName: true, lastName: true },
} as const;
const TAG_SELECT = { select: { id: true, name: true, color: true } } as const;

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSender: MetaSenderService,
    private readonly inboxEvents: InboxEventsService,
    private readonly config: ConfigService,
    private readonly summary: ConversationSummaryService,
  ) {}

  async listConversations(query: ListConversationsQueryDto, userId: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ConversationWhereInput = {};
    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }
    if (query.channel) where.channel = query.channel;
    if (query.crisis) where.flaggedCrisis = true;
    if (query.assigned === 'me') where.assignedUserId = userId;
    if (query.assigned === 'unassigned') where.assignedUserId = null;
    if (query.needsReply) {
      where.id = { in: await this.needsReplyIds() };
    }
    const contact: Prisma.ContactWhereInput = {};
    if (query.contactType) contact.contactType = query.contactType;
    if (query.lifecycleStatus) {
      contact.lifecycleStatus = query.lifecycleStatus;
    }
    if (query.tagId) contact.tags = { some: { id: query.tagId } };
    if (Object.keys(contact).length > 0) where.contact = contact;
    if (query.q) {
      // Ad, telefon, Instagram kimliği ve taslak olmayan mesaj içeriği.
      where.OR = [
        {
          contact: {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
              { instagramId: { contains: query.q } },
            ],
          },
        },
        {
          messages: {
            some: {
              isDraft: false,
              content: { contains: query.q, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contact: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              instagramId: true,
              contactType: true,
              lifecycleStatus: true,
              tags: TAG_SELECT,
            },
          },
          assignedUser: ASSIGNEE_SELECT,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              content: true,
              senderType: true,
              createdAt: true,
              isDraft: true,
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    if (items.length === 0) return { data: [], total, page, limit };

    // Okuma kayıtları ve cevap bekleyenler toplu çekilir (N+1 yok).
    const ids = items.map((item) => item.id);
    const [reads, replyIds] = await Promise.all([
      this.prisma.conversationRead.findMany({
        where: { userId, conversationId: { in: ids } },
        select: { conversationId: true, lastReadAt: true },
      }),
      this.needsReplyIds(ids),
    ]);
    const lastReadAt = new Map(
      reads.map((r) => [r.conversationId, r.lastReadAt]),
    );
    const needsReply = new Set(replyIds);

    const data = items.map(({ messages, ...conversation }) => {
      const readAt = lastReadAt.get(conversation.id);
      return {
        ...conversation,
        lastMessage: messages[0] ?? null,
        unread: !readAt || conversation.lastMessageAt > readAt,
        needsReply: needsReply.has(conversation.id),
      };
    });
    return { data, total, page, limit };
  }

  async getConversation(id: string) {
    const conversation = await this.findConversationOrFail(id);
    const contactId = conversation.contactId;
    const now = new Date();

    const [leads, appointments, lastClient] = await Promise.all([
      this.prisma.lead.findMany({
        where: { contactId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.appointment.findMany({
        where: { contactId, status: 'SCHEDULED', scheduledAt: { gte: now } },
        orderBy: { scheduledAt: 'asc' },
        include: {
          therapist: {
            select: {
              title: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.lastClientMessageAt(id),
    ]);

    const window = this.messagingWindow(conversation.channel, lastClient);
    return {
      ...conversation,
      leads,
      appointments,
      windowOpen: window.open,
      windowExpiresAt: window.expiresAt?.toISOString() ?? null,
    };
  }

  async listMessages(id: string, query: ListMessagesQueryDto) {
    await this.findConversationOrFail(id);
    const limit = query.limit ?? 50;

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { agentUser: AGENT_SELECT },
    });
    return rows.reverse();
  }

  async searchMessages(q: string) {
    const rows = await this.prisma.message.findMany({
      where: { isDraft: false, content: { contains: q, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_LIMIT,
      select: {
        id: true,
        conversationId: true,
        senderType: true,
        content: true,
        createdAt: true,
        conversation: {
          select: { contact: { select: { fullName: true, channel: true } } },
        },
      },
    });
    return rows.map((row) => ({
      conversationId: row.conversationId,
      messageId: row.id,
      snippet: this.snippetAround(row.content, q),
      senderType: row.senderType,
      createdAt: row.createdAt,
      contact: row.conversation.contact,
    }));
  }

  async sendMessage(id: string, dto: SendMessageDto, agentUserId: string) {
    const conversation = await this.findConversationOrFail(id);

    if (conversation.status === ConversationStatus.CLOSED) {
      throw new ConflictException(CLOSED_CONVERSATION_MESSAGE);
    }
    if (
      conversation.assignedUserId &&
      conversation.assignedUserId !== agentUserId &&
      !dto.force
    ) {
      const owner = conversation.assignedUser
        ? `${conversation.assignedUser.firstName} ${conversation.assignedUser.lastName}`
        : 'başka bir personel';
      throw new ConflictException(`Bu konuşma ${owner} üzerinde`);
    }
    if (
      conversation.channel === Channel.INSTAGRAM &&
      dto.content.length > this.instagramMaxChars()
    ) {
      throw new BadRequestException(
        `Instagram mesajları en fazla ${this.instagramMaxChars()} karakter olabilir.`,
      );
    }

    const window = this.messagingWindow(
      conversation.channel,
      await this.lastClientMessageAt(id),
    );
    if (!window.open) {
      throw new ConflictException(WINDOW_CLOSED_MESSAGE);
    }

    const recipientId =
      conversation.channel === Channel.INSTAGRAM
        ? conversation.contact.instagramId
        : conversation.contact.phone;
    if (!recipientId) {
      throw new BadRequestException('Danışanın iletişim kimliği bulunamadı.');
    }

    if (conversation.isBotActive) {
      await this.updateState(id, {
        isBotActive: false,
        status: ConversationStatus.PENDING_AGENT,
      });
    }

    const res = window.tag
      ? await this.metaSender.sendText(
          conversation.channel,
          recipientId,
          dto.content,
          { tag: 'HUMAN_AGENT' },
        )
      : await this.metaSender.sendText(
          conversation.channel,
          recipientId,
          dto.content,
        );
    if (!res.ok) {
      throw new BadGatewayException(SEND_FAILED_MESSAGE);
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderType: SenderType.AGENT,
        content: dto.content,
        agentUserId,
        metaMessageId: res.messageId ?? null,
      },
      include: { agentUser: AGENT_SELECT },
    });
    await this.prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: message.createdAt,
        ...this.autoAssignData(conversation, agentUserId),
      },
    });

    this.inboxEvents.emit('message.created', { conversationId: id, message });
    this.emitChanged(id);
    return message;
  }

  async takeover(id: string, userId: string) {
    const conversation = await this.findConversationOrFail(id);
    return this.updateState(id, {
      isBotActive: false,
      status: ConversationStatus.PENDING_AGENT,
      ...this.autoAssignData(conversation, userId),
    });
  }

  async assignConversation(id: string, userId: string | null) {
    await this.findConversationOrFail(id);
    if (userId === null) {
      await this.updateState(id, { assignedUserId: null, assignedAt: null });
      return this.findConversationOrFail(id);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });
    if (!user || user.role !== Role.ADMIN || !user.isActive) {
      throw new BadRequestException(
        'Konuşma yalnızca yönetici kullanıcılara atanabilir.',
      );
    }
    await this.updateState(id, {
      assignedUserId: userId,
      assignedAt: new Date(),
    });
    return this.findConversationOrFail(id);
  }

  async markRead(id: string, userId: string) {
    await this.findConversationOrFail(id);
    const now = new Date();
    const read = await this.prisma.conversationRead.upsert({
      where: { userId_conversationId: { userId, conversationId: id } },
      create: { userId, conversationId: id, lastReadAt: now },
      update: { lastReadAt: now },
    });
    this.inboxEvents.emit('counts.changed', {});
    return read;
  }

  async handback(id: string) {
    const conversation = await this.findConversationOrFail(id);
    if (conversation.flaggedCrisis) {
      throw new ConflictException(CRISIS_HANDBACK_MESSAGE);
    }
    return this.updateState(id, {
      isBotActive: true,
      status: ConversationStatus.OPEN,
    });
  }

  async close(id: string) {
    await this.findConversationOrFail(id);
    const conversation = await this.updateState(id, {
      isBotActive: false,
      status: ConversationStatus.CLOSED,
    });
    // Özet arka planda üretilir; hata olursa kapatma etkilenmez.
    void this.summary.summarize(id).catch(() => undefined);
    return conversation;
  }

  async updateContact(id: string, dto: UpdateContactDto) {
    const { tagIds, ...fields } = dto;
    const current = await this.prisma.contact.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Danışan bulunamadı.');
    }
    if (
      current.channel === Channel.WHATSAPP &&
      dto.phone !== undefined &&
      dto.phone !== current.phone
    ) {
      throw new BadRequestException(
        'WhatsApp numarası değiştirilemez; bu numara mesaj adresidir.',
      );
    }

    const data: Prisma.ContactUpdateInput = { ...fields };
    if (tagIds !== undefined) {
      const unique = [...new Set(tagIds)];
      const found = await this.prisma.contactTag.count({
        where: { id: { in: unique } },
      });
      if (found !== unique.length) {
        throw new BadRequestException('Bazı etiketler bulunamadı.');
      }
      data.tags = { set: unique.map((tagId) => ({ id: tagId })) };
    }

    try {
      return await this.prisma.contact.update({ where: { id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException(
            'Bu telefon numarası başka bir danışana kayıtlı.',
          );
        }
        if (err.code === 'P2025') {
          throw new NotFoundException('Danışan bulunamadı.');
        }
      }
      throw err;
    }
  }

  async deleteContactSummary(contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!contact) {
      throw new NotFoundException('Danışan bulunamadı.');
    }
    return this.prisma.contact.update({
      where: { id: contactId },
      data: { lastSummary: null, lastSummaryAt: null },
      select: { id: true, lastSummary: true, lastSummaryAt: true },
    });
  }

  async getCounts(userId: string) {
    const [open, pendingAgent, crisis, openCrisis, newLeads, openUnanswered] =
      await this.prisma.$transaction([
        this.prisma.conversation.count({
          where: { status: ConversationStatus.OPEN, isBotActive: true },
        }),
        this.prisma.conversation.count({
          where: { status: ConversationStatus.PENDING_AGENT },
        }),
        this.prisma.conversation.count({
          where: {
            flaggedCrisis: true,
            status: { not: ConversationStatus.CLOSED },
          },
        }),
        this.prisma.conversation.count({
          where: { flaggedCrisis: true, status: ConversationStatus.OPEN },
        }),
        this.prisma.lead.count({ where: { status: LeadStatus.YENI } }),
        this.prisma.unansweredQuestion.count({
          where: { status: UnansweredStatus.OPEN },
        }),
      ]);
    const [needsReply, unreadForMe] = await Promise.all([
      this.countNeedsReply(),
      this.countUnreadForUser(userId),
    ]);
    return {
      open,
      pendingAgent,
      crisis,
      attention: pendingAgent + openCrisis,
      newLeads,
      openUnanswered,
      needsReply,
      unreadForMe,
    };
  }

  stream(): Observable<{ type: string; data: unknown }> {
    return this.inboxEvents
      .stream()
      .pipe(map((event) => ({ type: event.type, data: event.data })));
  }

  private async findConversationOrFail(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: { include: { tags: TAG_SELECT } },
        assignedUser: ASSIGNEE_SELECT,
      },
    });
    if (!conversation) {
      throw new NotFoundException('Konuşma bulunamadı.');
    }
    return conversation;
  }

  // Atanmamış konuşmayı işlem yapan personele atar; atanmışsa dokunmaz.
  private autoAssignData(
    conversation: { assignedUserId?: string | null },
    userId: string,
  ): { assignedUserId?: string; assignedAt?: Date } {
    return conversation.assignedUserId
      ? {}
      : { assignedUserId: userId, assignedAt: new Date() };
  }

  // Son taslak olmayan mesajı danışandan gelen ve kapalı olmayan konuşmalar.
  private needsReplySql(scope: Prisma.Sql = Prisma.empty): Prisma.Sql {
    return Prisma.sql`
      SELECT c.id FROM conversations c
      JOIN LATERAL (
        SELECT m."senderType" FROM messages m
        WHERE m."conversationId" = c.id AND m."isDraft" = false
        ORDER BY m."createdAt" DESC LIMIT 1
      ) lm ON lm."senderType" = 'CLIENT'
      WHERE c.status <> 'CLOSED' ${scope}`;
  }

  private async needsReplyIds(ids?: string[]): Promise<string[]> {
    if (ids && ids.length === 0) return [];
    const scope = ids
      ? Prisma.sql`AND c.id IN (${Prisma.join(ids)})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      this.needsReplySql(scope),
    );
    return rows.map((row) => row.id);
  }

  private async countNeedsReply(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS count FROM (${this.needsReplySql()}) AS t`,
    );
    return rows[0]?.count ?? 0;
  }

  private async countUnreadForUser(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM conversations c
      LEFT JOIN conversation_reads r
        ON r."conversationId" = c.id AND r."userId" = ${userId}
      WHERE r.id IS NULL OR c."lastMessageAt" > r."lastReadAt"`;
    return rows[0]?.count ?? 0;
  }

  // Eşleşmenin çevresinden ±60 karakterlik kesit.
  private snippetAround(content: string, q: string): string {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(escaped, 'i').exec(content);
    if (!match) return content.slice(0, SNIPPET_RADIUS * 2);
    const start = Math.max(0, match.index - SNIPPET_RADIUS);
    const end = Math.min(
      content.length,
      match.index + match[0].length + SNIPPET_RADIUS,
    );
    return content.slice(start, end);
  }

  private async lastClientMessageAt(
    conversationId: string,
  ): Promise<Date | null> {
    const last = await this.prisma.message.findFirst({
      where: { conversationId, senderType: SenderType.CLIENT },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return last?.createdAt ?? null;
  }

  private instagramMaxChars(): number {
    const raw = Number(
      this.config.get<string>(
        'INSTAGRAM_MAX_CHARS',
        String(DEFAULT_INSTAGRAM_MAX_CHARS),
      ),
    );
    return Number.isInteger(raw) && raw >= 1
      ? raw
      : DEFAULT_INSTAGRAM_MAX_CHARS;
  }

  private humanAgentTagEnabled(): boolean {
    return this.config.get<string>('INSTAGRAM_HUMAN_AGENT_TAG') === 'true';
  }

  // Instagram + bayrak açıksa pencere 7 güne uzar; 24 saat sonrası HUMAN_AGENT etiketi gerektirir.
  private messagingWindow(
    channel: Channel,
    lastClientAt: Date | null,
  ): { open: boolean; tag: boolean; expiresAt: Date | null } {
    if (!lastClientAt) {
      return { open: false, tag: false, expiresAt: null };
    }
    const extended =
      channel === Channel.INSTAGRAM && this.humanAgentTagEnabled();
    const span = extended ? HUMAN_AGENT_WINDOW_MS : WINDOW_MS;
    const elapsed = Date.now() - lastClientAt.getTime();
    const open = elapsed < span;
    return {
      open,
      tag: open && extended && elapsed >= WINDOW_MS,
      expiresAt: new Date(lastClientAt.getTime() + span),
    };
  }

  private async updateState(
    id: string,
    data: Prisma.ConversationUncheckedUpdateInput,
  ) {
    const conversation = await this.prisma.conversation.update({
      where: { id },
      data,
    });
    this.emitChanged(id);
    return conversation;
  }

  private emitChanged(conversationId: string): void {
    this.inboxEvents.emit('conversation.updated', { conversationId });
    this.inboxEvents.emit('counts.changed', {});
  }
}
