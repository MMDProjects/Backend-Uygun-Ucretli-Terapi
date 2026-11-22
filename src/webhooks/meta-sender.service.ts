import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel } from '@prisma/client';

const DEFAULT_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 1000;
const MAX_LOGGED_BODY = 300;
const MAX_ERROR_MESSAGE = 200;
const NETWORK_ERROR = 'Ağ hatası veya zaman aşımı';

// AbortSignal.timeout ya da iptal: istek Meta'ya ulaşmış olabilir.
// instanceof yerine ad kontrolü: DOMException farklı bir realm'den gelebilir.
function isTimeoutError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('name' in err)) {
    return false;
  }
  return err.name === 'TimeoutError' || err.name === 'AbortError';
}

export interface MetaSendOptions {
  // Yalnızca Instagram'da uygulanır; WhatsApp'ta yok sayılır.
  tag?: 'HUMAN_AGENT';
}

export interface MetaSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface MetaTemplateSend {
  name: string;
  language: string;
  params: string[];
}

interface MetaSendResponse {
  messages?: { id?: string }[];
  message_id?: string;
}

// Meta şablon gövdesinin alan adları tek yerde tutulur. Doğrulanırsa
// ya da değişirse yalnızca bu fonksiyon düzeltilir.
function buildWhatsAppTemplateBody(
  recipientId: string,
  template: MetaTemplateSend,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: recipientId,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
    },
  };
  if (template.params.length > 0) {
    (body.template as Record<string, unknown>).components = [
      {
        type: 'body',
        parameters: template.params.map((text) => ({ type: 'text', text })),
      },
    ];
  }
  return body;
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
      // Instagram Login token'ı graph.instagram.com, Facebook Login (sistem
      // kullanıcısı) token'ı graph.facebook.com ister.
      const host =
        this.config.get<string>('INSTAGRAM_GRAPH_HOST') ||
        'graph.instagram.com';
      url = `https://${host}/${version}/${accountId}/messages`;
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

    const result = await this.post(channel, url, token, body);
    return result.ok
      ? { ok: true, messageId: result.messageId }
      : { ok: false };
  }

  // Yalnızca WhatsApp. Pencere kapalıyken onaylı şablonla gönderim.
  async sendTemplate(
    recipientPhone: string,
    template: MetaTemplateSend,
  ): Promise<MetaSendResult> {
    const version = this.config.get<string>('META_GRAPH_VERSION') ?? 'v21.0';
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!phoneNumberId || !token) {
      this.logger.warn(
        'WhatsApp şablon gönderimi atlandı: PHONE_NUMBER_ID veya ACCESS_TOKEN eksik',
      );
      return { ok: false, error: 'WhatsApp yapılandırması eksik' };
    }

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const body = buildWhatsAppTemplateBody(recipientPhone, template);
    // Şablonda zaman aşımı sonrası yeniden deneme yok: Meta isteği kabul
    // etmiş olabilir ve aynı şablon iki kez gitmesin.
    return this.post(Channel.WHATSAPP, url, token, body, {
      retryOnTimeout: false,
    });
  }

  // Yalnızca ağ hatası, timeout ve 5xx için bir kez yeniden dener
  // (şablonda timeout hariç).
  private async post(
    channel: Channel,
    url: string,
    token: string,
    body: Record<string, unknown>,
    options: { retryOnTimeout?: boolean } = {},
  ): Promise<MetaSendResult> {
    const retryOnTimeout = options.retryOnTimeout ?? true;
    const timeoutMs = this.timeoutMs();
    let lastError = NETWORK_ERROR;

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
        lastError = this.describeHttpError(res.status, detail);
        if (res.status < 500 || !canRetry) {
          return { ok: false, error: lastError };
        }
      } catch (err) {
        this.logger.error(
          `Meta gönderimi hata verdi (${channel})`,
          err as Error,
        );
        lastError = NETWORK_ERROR;
        if (!canRetry || (!retryOnTimeout && isTimeoutError(err))) {
          return { ok: false, error: lastError };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    return { ok: false, error: lastError };
  }

  // Meta'nın hata mesajını (varsa) kısaltarak kullanıcıya gösterilecek metin.
  private describeHttpError(status: number, detail: string): string {
    try {
      const parsed = JSON.parse(detail) as {
        error?: { message?: unknown };
      };
      const message = parsed.error?.message;
      if (typeof message === 'string' && message.length > 0) {
        return `HTTP ${status}: ${message.slice(0, MAX_ERROR_MESSAGE)}`;
      }
    } catch {
      // JSON değilse yalnızca durum kodu yazılır.
    }
    return `HTTP ${status}`;
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
