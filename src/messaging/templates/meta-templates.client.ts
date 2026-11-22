import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TemplateCategory } from '@prisma/client';

// Meta şablon API'sinin alan adları ve uç yolları tek yerde tutulur.
// Doğrulanırsa ya da değişirse yalnızca bu dosya düzeltilir.
const TEMPLATE_FIELDS =
  'name,status,category,language,components,id,rejected_reason';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_LOGGED_BODY = 300;
const MAX_ERROR_MESSAGE = 200;
const NETWORK_ERROR = 'Meta bağlantı hatası veya zaman aşımı';

export interface MetaTemplateComponent {
  type: string;
  text?: string;
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: MetaTemplateComponent[];
  rejected_reason?: string;
}

export interface MetaTemplateCreateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  bodyText: string;
  examples: string[];
}

export interface MetaTemplateCreateResult {
  id?: string;
  status?: string;
}

interface MetaListResponse {
  data?: MetaTemplate[];
  paging?: { next?: string };
}

type MetaMethod = 'GET' | 'POST' | 'DELETE';

// Meta gövdesi: BODY bileşeni, örnekler varsa example.body_text ile.
function buildCreateBody(
  input: MetaTemplateCreateInput,
): Record<string, unknown> {
  const bodyComponent: Record<string, unknown> = {
    type: 'BODY',
    text: input.bodyText,
  };
  if (input.examples.length > 0) {
    bodyComponent.example = { body_text: [input.examples] };
  }
  return {
    name: input.name,
    language: input.language,
    category: input.category,
    components: [bodyComponent],
  };
}

@Injectable()
export class MetaTemplatesClient {
  private readonly logger = new Logger(MetaTemplatesClient.name);

  constructor(private readonly config: ConfigService) {}

  // Sync, oluşturma ve silmeden önce WABA kimliği ve erişim anahtarını doğrular.
  assertConfigured(): void {
    this.wabaId();
    this.token();
  }

  // Sayfalı listenin tamamını getirir.
  async listAll(): Promise<MetaTemplate[]> {
    const all: MetaTemplate[] = [];
    let url: string | undefined =
      `${this.collectionUrl()}?fields=${TEMPLATE_FIELDS}&limit=${PAGE_LIMIT}`;
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const json = await this.request<MetaListResponse>('GET', url);
      all.push(...(json.data ?? []));
      url = this.nextPageUrl(json.paging?.next);
    }
    return all;
  }

  async create(
    input: MetaTemplateCreateInput,
  ): Promise<MetaTemplateCreateResult> {
    return this.request<MetaTemplateCreateResult>(
      'POST',
      this.collectionUrl(),
      buildCreateBody(input),
    );
  }

  // Meta adla siler (ad + dil yerine yalnızca ad kullanılır).
  async delete(name: string): Promise<void> {
    await this.request<unknown>(
      'DELETE',
      `${this.collectionUrl()}?name=${encodeURIComponent(name)}`,
    );
  }

  private async request<T>(
    method: MetaMethod,
    url: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const token = this.token();
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch (err) {
      this.logger.error('Meta şablon isteği hata verdi', err as Error);
      throw new BadGatewayException(NETWORK_ERROR);
    }

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      this.logger.error(
        `Meta şablon isteği başarısız: HTTP ${res.status} ${text.slice(0, MAX_LOGGED_BODY)}`,
      );
      throw new BadGatewayException(this.describeHttpError(res.status, text));
    }
    return this.parseJson<T>(text);
  }

  // Sayfalama bağlantısı başka bir sunucuya gidiyorsa token sızmasın diye reddedilir.
  private nextPageUrl(next?: string): string | undefined {
    if (!next) {
      return undefined;
    }
    if (!next.startsWith(this.baseUrl())) {
      throw new BadGatewayException('Beklenmeyen sayfalama adresi');
    }
    return next;
  }

  private parseJson<T>(text: string): T {
    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      return {} as T;
    }
  }

  // Meta'nın hata mesajını (varsa) kısaltarak döner.
  private describeHttpError(status: number, text: string): string {
    try {
      const parsed = JSON.parse(text) as { error?: { message?: unknown } };
      const message = parsed.error?.message;
      if (typeof message === 'string' && message.length > 0) {
        return `HTTP ${status}: ${message.slice(0, MAX_ERROR_MESSAGE)}`;
      }
    } catch {
      // JSON değilse yalnızca durum kodu yazılır.
    }
    return `HTTP ${status}`;
  }

  private baseUrl(): string {
    const version = this.config.get<string>('META_GRAPH_VERSION') ?? 'v21.0';
    return `https://graph.facebook.com/${version}`;
  }

  private collectionUrl(): string {
    return `${this.baseUrl()}/${this.wabaId()}/message_templates`;
  }

  private wabaId(): string {
    const id = this.config.get<string>('WHATSAPP_BUSINESS_ACCOUNT_ID');
    if (!id) {
      throw new ServiceUnavailableException('WABA kimliği tanımlı değil');
    }
    return id;
  }

  private token(): string {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException(
        'WhatsApp erişim anahtarı tanımlı değil',
      );
    }
    return token;
  }

  private timeoutMs(): number {
    const value = Number(this.config.get<string>('META_TIMEOUT_MS'));
    return value > 0 ? value : DEFAULT_TIMEOUT_MS;
  }
}
