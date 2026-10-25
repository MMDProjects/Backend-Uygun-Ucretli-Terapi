import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel } from '@prisma/client';

const DEFAULT_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1000;
const MAX_LOGGED_BODY = 300;

export interface MetaSendOptions {
  // Yalnızca Instagram'da uygulanır; WhatsApp'ta yok sayılır.
  tag?: 'HUMAN_AGENT';
}

export interface MetaSendResult {
  ok: boolean;
  messageId?: string;
}

interface MetaSendResponse {
  messages?: { id?: string }[];
  message_id?: string;
}

@Injectable()
export class MetaSenderService {
  private readonly logger = new Logger(MetaSenderService.name);

  constructor(private config: ConfigService) {}

  async sendText(
    channel: Channel,
    recipientId: string,
    text: string,
    opts?: MetaSendOptions,
  ): Promise<MetaSendResult> {
    const version = this.config.get<string>('META_GRAPH_VERSION') ?? 'v21.0';

    let url: string;
    let token: string | undefined;
    let body: Record<string, unknown>;

    if (channel === Channel.WHATSAPP) {
      const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
      token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
      if (!phoneNumberId || !token) {
        this.logger.warn(
          'WhatsApp gönderimi atlandı: PHONE_NUMBER_ID veya ACCESS_TOKEN eksik',
        );
        return { ok: false };
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
        this.logger.warn(
          'Instagram gönderimi atlandı: ACCOUNT_ID veya ACCESS_TOKEN eksik',
        );
        return { ok: false };
      }
      url = `https://graph.instagram.com/${version}/${accountId}/messages`;
      body = {
        recipient: { id: recipientId },
        message: { text },
      };
      // 24 saatlik pencere dışında kişisel insan-ajan etiketi (7 güne kadar).
      if (opts?.tag === 'HUMAN_AGENT') {
        body.messaging_type = 'MESSAGE_TAG';
        body.tag = 'HUMAN_AGENT';
      }
    } else {
      this.logger.warn(
        `Desteklenmeyen kanal için gönderim atlandı: ${channel}`,
      );
      return { ok: false };
    }

    return this.post(channel, url, token, body);
  }

  // Yalnızca ağ hatası, timeout ve 5xx için bir kez yeniden dener.
  private async post(
    channel: Channel,
    url: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<MetaSendResult> {
    const timeoutMs = this.timeoutMs();

    for (let attempt = 1; attempt <= 2; attempt++) {
      const canRetry = attempt === 1;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          const json = (await res
            .json()
            .catch(() => null)) as MetaSendResponse | null;
          return { ok: true, messageId: this.readMessageId(channel, json) };
        }

        const detail = (await res.text().catch(() => '')).slice(
          0,
          MAX_LOGGED_BODY,
        );
        this.logger.error(
          `Meta gönderimi başarısız (${channel}): HTTP ${res.status} ${detail}`,
        );
        if (res.status < 500 || !canRetry) {
          return { ok: false };
        }
      } catch (err) {
        this.logger.error(
          `Meta gönderimi hata verdi (${channel})`,
          err as Error,
        );
        if (!canRetry) {
          return { ok: false };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    return { ok: false };
  }

  private readMessageId(
    channel: Channel,
    json: MetaSendResponse | null,
  ): string | undefined {
    if (channel === Channel.WHATSAPP) {
      return json?.messages?.[0]?.id;
    }
    return json?.message_id;
  }

  private timeoutMs(): number {
    const value = Number(this.config.get<string>('META_TIMEOUT_MS'));
    return value > 0 ? value : DEFAULT_TIMEOUT_MS;
  }
}
