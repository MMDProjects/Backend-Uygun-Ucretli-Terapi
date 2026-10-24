import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Channel,
  ConversationStatus,
  LeadStatus,
  Prisma,
  SenderType,
  UnansweredStatus,
} from '@prisma/client';
import { Observable, map } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_CLOSED_MESSAGE =
  '24 saatlik mesajlaşma penceresi kapandı; danışan yeniden yazana kadar serbest mesaj gönderilemez.';
const CRISIS_HANDBACK_MESSAGE = 'Kriz işaretli konuşma Elif’e geri verilemez.';
const SEND_FAILED_MESSAGE = 'Mesaj Meta’ya iletilemedi.';

const AGENT_SELECT = { select: { firstName: true, lastName: true } } as const;

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSender: MetaSenderService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  async listConversations(query: ListConversationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ConversationWhereInput = {};
    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ConversationStatus;
    }
    if (query.channel) where.channel = query.channel;
    if (query.crisis) where.flaggedCrisis = true;
    if (query.q) {
      where.contact = {
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q } },
        ],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contact: {
            select: { id: true, fullName: true, phone: true, instagramId: true },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, senderType: true, createdAt: true },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const data = items.map(({ messages, ...conversation }) => ({
      ...conversation,
      lastMessage: messages[0] ?? null,
    }));
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
            select: { title: true, user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.lastClientMessageAt(id),
    ]);

    return {
      ...conversation,
      leads,
      appointments,
      windowOpen: this.isWindowOpen(lastClient),
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

  async sendMessage(id: string, dto: SendMessageDto, agentUserId: string) {
    const conversation = await this.findConversationOrFail(id);

    if (!this.isWindowOpen(await this.lastClientMessageAt(id))) {
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

    const sent = await this.metaSender.sendText(
      conversation.channel,
      recipientId,
      dto.content,
    );
    if (!sent) {
      throw new BadGatewayException(SEND_FAILED_MESSAGE);
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderType: SenderType.AGENT,
        content: dto.content,
        agentUserId,
      },
      include: { agentUser: AGENT_SELECT },
    });
    await this.prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: message.createdAt },
    });

    this.inboxEvents.emit('message.created', { conversationId: id, message });
    this.emitChanged(id);
    return message;
  }

  async takeover(id: string) {
    await this.findConversationOrFail(id);
    return this.updateState(id, {
      isBotActive: false,
      status: ConversationStatus.PENDING_AGENT,
    });
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
    return this.updateState(id, {
      isBotActive: false,
      status: ConversationStatus.CLOSED,
    });
  }

  async updateContact(id: string, dto: UpdateContactDto) {
    try {
      return await this.prisma.contact.update({ where: { id }, data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException('Bu telefon numarası başka bir danışana kayıtlı.');
        }
        if (err.code === 'P2025') {
          throw new NotFoundException('Danışan bulunamadı.');
        }
      }
      throw err;
    }
  }

  async getCounts() {
    const [open, pendingAgent, crisis, newLeads, openUnanswered] =
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
        this.prisma.lead.count({ where: { status: LeadStatus.YENI } }),
        this.prisma.unansweredQuestion.count({
          where: { status: UnansweredStatus.OPEN },
        }),
      ]);
    return { open, pendingAgent, crisis, newLeads, openUnanswered };
  }

  stream(): Observable<{ type: string; data: unknown }> {
    return this.inboxEvents
      .stream()
      .pipe(map((event) => ({ type: event.type, data: event.data })));
  }

  private async findConversationOrFail(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { contact: true },
    });
    if (!conversation) {
      throw new NotFoundException('Konuşma bulunamadı.');
    }
    return conversation;
  }

  private async lastClientMessageAt(conversationId: string): Promise<Date | null> {
    const last = await this.prisma.message.findFirst({
      where: { conversationId, senderType: SenderType.CLIENT },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return last?.createdAt ?? null;
  }

  private isWindowOpen(lastClientAt: Date | null): boolean {
    return !!lastClientAt && Date.now() - lastClientAt.getTime() < WINDOW_MS;
  }

  private async updateState(
    id: string,
    data: { isBotActive?: boolean; status?: ConversationStatus },
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
