import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

export type CrisisAlertKind = 'detected' | 'repeat' | 'handoff';

const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

const CHANNEL_LABELS: Record<Channel, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  WEB: 'Web',
};

@Injectable()
export class CrisisAlertService {
  private readonly logger = new Logger(CrisisAlertService.name);
  // Aynı konuşma için son 10 dakikada gönderilen bildirimler.
  private readonly lastSent = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async alert(conversationId: string, kind: CrisisAlertKind): Promise<void> {
    try {
      const now = Date.now();
      const last = this.lastSent.get(conversationId);
      if (last !== undefined && now - last < DEDUPE_WINDOW_MS) {
        this.logger.debug(
          `Kriz bildirimi atlandı (yakın zamanda gönderildi): ${conversationId}`,
        );
        return;
      }

      const recipients = this.recipients();
      if (recipients.length === 0) {
        this.logger.warn('Kriz bildirimi için alıcı e-posta tanımlı değil');
        return;
      }

      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          channel: true,
          contact: { select: { fullName: true, phone: true } },
        },
      });
      if (!conversation) {
        this.logger.warn(
          `Kriz bildirimi: konuşma bulunamadı ${conversationId}`,
        );
        return;
      }

      this.lastSent.set(conversationId, now);
      await this.mail.sendCrisisAlert({
        to: recipients,
        contactLabel: this.contactLabel(
          conversation.channel,
          conversation.contact,
        ),
        channel: CHANNEL_LABELS[conversation.channel],
        at: new Date(now),
        link: `${this.frontendUrl}/admin/mesajlar?c=${conversationId}`,
      });
      this.logger.log(`Kriz bildirimi gönderildi (${kind}): ${conversationId}`);
    } catch (err) {
      // Hata çağıranı bozmaz; yalnızca loglanır.
      this.logger.error(`Kriz bildirimi gönderilemedi: ${conversationId}`, err);
    }
  }

  private recipients(): string[] {
    const list = (this.config.get<string>('CRISIS_ALERT_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    if (list.length > 0) return list;
    const admin = (
      this.config.get<string>('ADMIN_NOTIFICATION_EMAIL') ?? ''
    ).trim();
    return admin ? [admin] : [];
  }

  private get frontendUrl(): string {
    const raw =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return raw.split(',')[0].trim().replace(/\/$/, '');
  }

  private contactLabel(
    channel: Channel,
    contact: { fullName: string | null; phone: string | null },
  ): string {
    const name = contact.fullName?.trim();
    if (name) return name;
    const digits = (contact.phone ?? '').replace(/\D/g, '');
    if (digits.length >= 4) return `•••• ${digits.slice(-4)}`;
    if (channel === Channel.INSTAGRAM) return 'Instagram danışanı';
    return 'Bilinmeyen danışan';
  }
}
