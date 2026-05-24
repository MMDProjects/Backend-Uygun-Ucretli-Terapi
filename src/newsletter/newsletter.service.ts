import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async subscribe(dto: SubscribeDto) {
    const exists = await this.prisma.newsletter.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Bu e-posta zaten kayıtlı');

    await this.prisma.newsletter.create({ data: { email: dto.email } });

    this.syncToBrevo(dto.email).catch((err) =>
      this.logger.error('Brevo senkronizasyon hatası', err),
    );

    return { message: 'Bültene başarıyla kaydoldunuz' };
  }

  private async syncToBrevo(email: string) {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    const listId = this.config.get<string>('BREVO_NEWSLETTER_LIST_ID');

    if (!apiKey || apiKey === 'your-brevo-api-key') {
      this.logger.warn(`[DEV] Brevo'ya kaydedilecek: ${email}`);
      return;
    }

    const client = new BrevoClient({ apiKey });
    await client.contacts.createContact({
      email,
      listIds: [Number(listId)],
      updateEnabled: true,
    });
  }
}
