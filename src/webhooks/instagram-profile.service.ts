import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PROFILE_TIMEOUT_MS = 5000;

interface InstagramProfileResponse {
  name?: string;
  username?: string;
}

// Instagram danışanının adını Graph API'den okur. Hata olursa sessizce null döner.
@Injectable()
export class InstagramProfileService {
  private readonly logger = new Logger(InstagramProfileService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchName(igsid: string): Promise<string | null> {
    const token = this.config.get<string>('INSTAGRAM_ACCESS_TOKEN');
    if (!token) return null;

    const version = this.config.get<string>('META_GRAPH_VERSION') || 'v21.0';
    const url =
      `https://graph.instagram.com/${version}/${encodeURIComponent(igsid)}` +
      `?fields=name,username&access_token=${encodeURIComponent(token)}`;

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Yanıt gövdesi token içerebileceği için loglanmaz.
        this.logger.debug(`Instagram profili alınamadı: HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as InstagramProfileResponse;
      const name = json.name?.trim();
      if (name) return name;
      return json.username ? `@${json.username}` : null;
    } catch (err) {
      this.logger.debug(
        `Instagram profili isteği hata verdi: ${(err as Error)?.name ?? 'bilinmeyen'}`,
      );
      return null;
    }
  }
}
