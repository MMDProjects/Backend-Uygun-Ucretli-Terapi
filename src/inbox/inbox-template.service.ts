import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Channel,
  ConversationStatus,
  DeliveryStatus,
  SenderType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { renderTemplate } from '../messaging/template-render';
import { normalizeWhatsAppPhone } from '../messaging/phone';
import { SendTemplateDto } from './dto/send-template.dto';
import {
  APPROVED_TEMPLATE_PORT,
  ApprovedTemplatePort,
} from './approved-template.port';

const CLOSED_CONVERSATION_MESSAGE = 'Kapalı konuşmaya mesaj gönderilemez.';
const SEND_FAILED_MESSAGE = 'Şablon mesajı Meta’ya iletilemedi.';
const NOT_WHATSAPP_MESSAGE =
  'Şablon yalnızca WhatsApp konuşmalarında gönderilebilir.';
const NO_TEMPLATE_SERVICE_MESSAGE = 'Şablon servisi kullanılamıyor.';

const AGENT_SELECT = { select: { firstName: true, lastName: true } } as const;

// Penceresi kapanmış WhatsApp konuşmasına onaylı şablonla personel mesajı.
// Pencere kontrolü yapılmaz: şablon her zaman gönderilebilir.
@Injectable()
export class InboxTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaSender: MetaSenderService,
    private readonly inboxEvents: InboxEventsService,
    @Optional()
    @Inject(APPROVED_TEMPLATE_PORT)
    private readonly templates?: ApprovedTemplatePort,
  ) {}

  async sendTemplate(id: string, dto: SendTemplateDto, agentUserId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Konuşma bulunamadı.');
    }
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
    if (conversation.channel !== Channel.WHATSAPP) {
      throw new BadRequestException(NOT_WHATSAPP_MESSAGE);
    }
    if (!this.templates) {
      throw new ServiceUnavailableException(NO_TEMPLATE_SERVICE_MESSAGE);
    }

    const template = await this.templates.getApproved(dto.templateId);
    if (template.variableCount !== dto.params.length) {
      throw new BadRequestException(
        `Şablon ${template.variableCount} değişken bekliyor, ${dto.params.length} değişken gönderildi.`,
      );
    }
    const phone = normalizeWhatsAppPhone(conversation.contact.phone);
    if (!phone) {
      throw new BadRequestException(
        'Danışanın geçerli bir telefon numarası yok.',
      );
    }

    const res = await this.metaSender.sendTemplate(phone, {
      name: template.name,
      language: template.language,
      params: dto.params,
    });
    if (!res.ok) {
      throw new BadGatewayException(res.error ?? SEND_FAILED_MESSAGE);
    }

    // Bot yalnızca gönderim başarılıysa devredilir; hatada konuşma değişmez.
    if (conversation.isBotActive) {
      await this.prisma.conversation.update({
        where: { id },
        data: {
          isBotActive: false,
          status: ConversationStatus.PENDING_AGENT,
        },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderType: SenderType.AGENT,
        content: renderTemplate(template.bodyText, dto.params),
        agentUserId,
        metaMessageId: res.messageId ?? null,
        templateName: template.name,
        deliveryStatus: DeliveryStatus.SENT,
      },
      include: { agentUser: AGENT_SELECT },
    });
    await this.prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: message.createdAt,
        ...(conversation.assignedUserId
          ? {}
          : { assignedUserId: agentUserId, assignedAt: new Date() }),
      },
    });

    this.inboxEvents.emit('message.created', { conversationId: id, message });
    this.inboxEvents.emit('conversation.updated', { conversationId: id });
    this.inboxEvents.emit('counts.changed', {});
    return message;
  }
}
