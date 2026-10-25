import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CampaignStatus,
  RecipientStatus,
  WhatsAppTemplate,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MetaSenderService,
  MetaSendResult,
} from '../../webhooks/meta-sender.service';
import { isQuiet } from '../quiet-hours';
import { CampaignsService } from './campaigns.service';
import {
  buildTemplateParams,
  CAMPAIGN_MAX_ATTEMPTS,
  evaluateEligibility,
  isTemplateUsable,
  ParamMappingItem,
  readParamMapping,
} from './campaign-rules';

const TICK_MS = 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const STALE_SENDING_MS = 10 * 60 * 1000;
const DEFAULT_RATE_PER_MINUTE = 60;
const MAX_CAMPAIGNS_PER_TICK = 20;

export type CampaignTickResult = 'paused' | 'quiet' | 'rate_limited' | 'ran';

interface RecipientClaim {
  id: string;
  contactId: string;
  attempts: number;
}

@Injectable()
export class CampaignWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly meta: MetaSenderService,
    private readonly campaigns: CampaignsService,
  ) {}

  // Test ortamında ya da CAMPAIGN_WORKER_ENABLED=false ise zamanlayıcı başlamaz.
  // Gönderimi asıl kapatan panel ayarıdır (campaignsEnabled, varsayılan kapalı).
  onModuleInit(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      this.config.get<string>('CAMPAIGN_WORKER_ENABLED') === 'false'
    ) {
      return;
    }
    this.timer = setInterval(() => void this.safeTick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Bir tur sürerken yeni tur başlamaz.
  async safeTick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick(new Date());
    } catch (error) {
      this.logger.error('Kampanya işçisi turu başarısız', error as Error);
    } finally {
      this.running = false;
    }
  }

  async tick(now: Date): Promise<CampaignTickResult> {
    const settings = await this.campaigns.loadSettings();
    // Kapalıyken durum korunur; yeniden açılınca kaldığı yerden devam eder.
    if (!settings.campaignsEnabled) return 'paused';

    await this.prisma.campaign.updateMany({
      where: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      data: { status: CampaignStatus.SENDING, startedAt: now },
    });

    const sending = await this.prisma.campaign.findMany({
      where: { status: CampaignStatus.SENDING },
      orderBy: { startedAt: 'asc' },
      select: { id: true, templateId: true, paramMapping: true },
    });

    await this.reclaimStale(
      sending.map((c) => c.id),
      now,
    );

    // Kampanya sessiz saatleri de hatırlatma ayarlarındaki reminderQuietStart/End
    // ile belirlenir. Sessizken gönderim yapılmaz; ama açık alıcısı kalmayan
    // kampanyalar yine de tamamlanabilsin diye sayılar yenilenir.
    if (isQuiet(now, settings.reminderQuietStart, settings.reminderQuietEnd)) {
      await this.recountAll(sending);
      return 'quiet';
    }

    const sentRecently = await this.prisma.campaignRecipient.count({
      where: { sentAt: { gte: new Date(now.getTime() - RATE_WINDOW_MS) } },
    });
    let budget = this.ratePerMinute() - sentRecently;
    if (budget <= 0) {
      // Hız sınırında da biten kampanyalar tamamlanabilsin
      await this.recountAll(sending);
      return 'rate_limited';
    }

    for (const campaign of sending.slice(0, MAX_CAMPAIGNS_PER_TICK)) {
      if (budget <= 0) break;
      const template = await this.prisma.whatsAppTemplate.findUnique({
        where: { id: campaign.templateId },
      });
      if (!template || !isTemplateUsable(template)) {
        // Şablon artık kullanılamaz (ör. PAUSED): kampanya gönderimden çıkar
        // ve hazır duruma döner; her turda uyarı yazıp SENDING'de takılı
        // kalmaz. Şablon düzelince personel yeniden gönderebilir.
        this.logger.warn(
          `Kampanya ${campaign.id} duraklatıldı: şablon onaylı değil`,
        );
        await this.prisma.campaign.updateMany({
          where: { id: campaign.id, status: CampaignStatus.SENDING },
          data: { status: CampaignStatus.READY },
        });
        continue;
      }

      const candidates = await this.prisma.campaignRecipient.findMany({
        where: {
          campaignId: campaign.id,
          included: true,
          status: RecipientStatus.PENDING,
        },
        orderBy: { createdAt: 'asc' },
        take: budget,
        select: { id: true, contactId: true, attempts: true },
      });

      const mapping = readParamMapping(campaign.paramMapping);
      for (const candidate of candidates) {
        if (budget <= 0) break;
        // Koşullu güncelleme: aynı alıcı iki kez alınamaz.
        const claim = await this.prisma.campaignRecipient.updateMany({
          where: {
            id: candidate.id,
            status: RecipientStatus.PENDING,
            attempts: candidate.attempts,
          },
          data: {
            status: RecipientStatus.SENDING,
            attempts: candidate.attempts + 1,
          },
        });
        if (claim.count === 0) continue;
        budget -= 1;
        await this.deliver(
          { ...candidate, attempts: candidate.attempts + 1 },
          template,
          mapping,
        );
      }
    }

    // Açık alıcı kalmayan kampanyalar burada tamamlanır.
    await this.recountAll(sending);
    return 'ran';
  }

  private async recountAll(campaigns: { id: string }[]): Promise<void> {
    for (const campaign of campaigns) {
      await this.campaigns.recountFor(campaign.id);
    }
  }

  // Gönderim sırasında çöken alıcılar bekleyene geri alınır.
  private async reclaimStale(campaignIds: string[], now: Date): Promise<void> {
    if (campaignIds.length === 0) return;
    await this.prisma.campaignRecipient.updateMany({
      where: {
        campaignId: { in: campaignIds },
        status: RecipientStatus.SENDING,
        updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) },
      },
      data: { status: RecipientStatus.PENDING },
    });
  }

  private async deliver(
    recipient: RecipientClaim,
    template: WhatsAppTemplate,
    mapping: ParamMappingItem[],
  ): Promise<void> {
    // Gönderimden hemen önce son kontrol: "DUR" ya da telefon değişikliği.
    const contact = await this.prisma.contact.findUnique({
      where: { id: recipient.contactId },
      select: {
        fullName: true,
        phone: true,
        contactType: true,
        marketingOptOut: true,
        reminderOptOut: true,
      },
    });
    if (!contact) return;

    const verdict = evaluateEligibility(contact);
    if (!verdict.eligible) {
      await this.prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: RecipientStatus.SKIPPED, skipReason: verdict.reason },
      });
      return;
    }

    const params = buildTemplateParams(
      mapping,
      template.variableCount,
      contact,
    );
    const result = await this.send(verdict.phone, {
      name: template.name,
      language: template.language,
      params,
    });

    if (result.ok) {
      // Meta kabul etti: yeniden deneme yok. Yazım başarısızsa alıcı PENDING'e
      // dönmesin diye FAILED işaretlenir (ikinci gönderimi önlemek için).
      try {
        await this.prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: RecipientStatus.SENT,
            messageId: result.messageId ?? null,
            sentAt: new Date(),
            error: null,
          },
        });
      } catch (error) {
        this.logger.error(
          `Alıcı gönderildi ama kaydedilemedi (${recipient.id}, ${result.messageId ?? '-'})`,
          error as Error,
        );
        await this.prisma.campaignRecipient
          .update({
            where: { id: recipient.id },
            data: {
              status: RecipientStatus.FAILED,
              messageId: result.messageId ?? null,
              error: `Meta kabul etti, durum kaydedilemedi (mesaj ${result.messageId ?? '-'}).`,
            },
          })
          .catch((markError: unknown) =>
            this.logger.error(
              `Alıcı FAILED işaretlenemedi (${recipient.id})`,
              markError as Error,
            ),
          );
      }
      return;
    }

    const exhausted = recipient.attempts >= CAMPAIGN_MAX_ATTEMPTS;
    await this.prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: exhausted ? RecipientStatus.FAILED : RecipientStatus.PENDING,
        error: result.error ?? 'Gönderim başarısız',
      },
    });
  }

  // Beklenmedik hata da başarısızlık sayılır; alıcı SENDING'de takılı kalmaz.
  private async send(
    phone: string,
    template: { name: string; language: string; params: string[] },
  ): Promise<MetaSendResult> {
    try {
      return await this.meta.sendTemplate(phone, template);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private ratePerMinute(): number {
    const value = Number(this.config.get<string>('CAMPAIGN_RATE_PER_MINUTE'));
    return Number.isInteger(value) && value > 0
      ? value
      : DEFAULT_RATE_PER_MINUTE;
  }
}
