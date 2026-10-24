import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel } from '@prisma/client';

@Injectable()
export class MetaSenderService {
  private readonly logger = new Logger(MetaSenderService.name);

  constructor(private config: ConfigService) {}

  async sendText(
    channel: Channel,
    recipientId: string,
    text: string,
  ): Promise<boolean> {
    const version = this.config.get<string>('META_GRAPH_VERSION') ?? 'v21.0';

    let url: string;
    let token: string | undefined;
    let body: Record<string, unknown>;

    if (channel === Channel.WHATSAPP) {
      const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
      token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
      if (!phoneNumberId || !token) {
        this.logger.warn('WhatsApp gönderimi atlandı: PHONE_NUMBER_ID veya ACCESS_TOKEN eksik');
        return false;
      }
      url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
      body = {
        messaging_product: 'whatsapp',
        to: recipientId,
        type: 'text',
        text: { body: text },
      };
    } else if (channel === Channel.INSTAGRAM) {
      const accountId = this.config.get<string>('INSTAGRAM_ACCOUNT_ID');
      token = this.config.get<string>('INSTAGRAM_ACCESS_TOKEN');
      if (!accountId || !token) {
        this.logger.warn('Instagram gönderimi atlandı: ACCOUNT_ID veya ACCESS_TOKEN eksik');
        return false;
      }
      url = `https://graph.instagram.com/${version}/${accountId}/messages`;
      body = {
        recipient: { id: recipientId },
        message: { text },
      };
    } else {
      this.logger.warn(`Desteklenmeyen kanal için gönderim atlandı: ${channel}`);
      return false;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(`Meta gönderimi başarısız (${channel}): HTTP ${res.status} ${detail}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Meta gönderimi hata verdi (${channel})`, err as Error);
      return false;
    }
  }
}
