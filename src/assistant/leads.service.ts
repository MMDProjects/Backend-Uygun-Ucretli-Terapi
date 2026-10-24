import { Injectable, Logger } from '@nestjs/common';
import { Channel, Contact, ServiceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

export interface LeadToolArgs {
  hizmet: string;
  ad_soyad: string;
  yas?: number;
  telefon?: string;
  arama_saati: string;
  ozet: string;
}

export interface LeadToolResult {
  ok: boolean;
  message: string;
}

const SERVICE_MAP: Record<string, ServiceType> = {
  bireysel: ServiceType.BIREYSEL,
  cift: ServiceType.CIFT,
  aile: ServiceType.AILE,
  cocuk_ergen: ServiceType.COCUK_ERGEN,
  emdr: ServiceType.EMDR,
  ucretsiz_on_gorusme: ServiceType.ON_GORUSME,
};

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mail: MailService,
    private inboxEvents: InboxEventsService,
  ) {}

  async createFromTool(
    conversation: { id: string; channel: Channel },
    contact: Pick<Contact, 'id' | 'phone'>,
    args: LeadToolArgs,
  ): Promise<LeadToolResult> {
    const telefon = args.telefon?.trim() || null;
    const phone = contact.phone ?? telefon;

    if (conversation.channel === Channel.INSTAGRAM && !phone) {
      return {
        ok: false,
        message:
          'Telefon numarası alınmadan arama talebi kaydedilemez. Danışandan telefon numarasını isteyin.',
      };
    }

    const serviceType = SERVICE_MAP[args.hizmet];
    if (!serviceType) {
      return {
        ok: false,
        message: `Geçersiz hizmet türü: ${args.hizmet}. Hizmet türünü danışanla netleştirin.`,
      };
    }

    const recent = await this.prisma.lead.findFirst({
      where: {
        conversationId: conversation.id,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) {
      return {
        ok: false,
        message:
          'Bu konuşma için son 10 dakika içinde zaten bir arama talebi kaydedildi. Yeni bir talep açmayın.',
      };
    }

    const age =
      typeof args.yas === 'number' && Number.isInteger(args.yas)
        ? args.yas
        : null;

    await this.prisma.lead.create({
      data: {
        contactId: contact.id,
        conversationId: conversation.id,
        channel: conversation.channel,
        serviceType,
        fullName: args.ad_soyad,
        age,
        phone,
        preferredCallTime: args.arama_saati,
        summary: args.ozet,
      },
    });

    if (conversation.channel === Channel.INSTAGRAM && !contact.phone && telefon) {
      try {
        await this.prisma.contact.update({
          where: { id: contact.id },
          data: { phone: telefon },
        });
      } catch (err) {
        this.logger.error(`Instagram telefonu kaydedilemedi (${contact.id})`, err);
      }
    }

    this.inboxEvents.emit('counts.changed', {});

    this.notifications
      .notifyAdmins(
        'INFO',
        `Yeni arama talebi: ${args.ad_soyad}, ${args.arama_saati}, ${serviceType}`,
      )
      .catch(() => {});
    this.mail
      .sendNewLeadAdmin({
        fullName: args.ad_soyad,
        preferredCallTime: args.arama_saati,
        serviceType,
        channel: conversation.channel,
      })
      .catch(() => {});

    return {
      ok: true,
      message: `Arama talebi kaydedildi. Ekibimiz danışanı "${args.arama_saati}" tercihine göre arayacak.`,
    };
  }
}
