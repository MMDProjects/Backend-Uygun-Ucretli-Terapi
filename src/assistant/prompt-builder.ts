import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ELIF_SYSTEM_PROMPT,
  PROMPT_PRICE_TABLE,
} from './prompts/elif-system-prompt';

export interface KnowledgeContextItem {
  title: string;
  content: string;
}

const TR_LOCALE = 'tr-TR';
const ISTANBUL_TZ = 'Europe/Istanbul';
const PRICE_PLACEHOLDER = '{{FIYAT_TABLOSU}}';

@Injectable()
export class PromptBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  buildSystemPrompt(priceTable: string): string {
    return ELIF_SYSTEM_PROMPT.replace(PRICE_PLACEHOLDER, () => priceTable);
  }

  async buildPriceTable(): Promise<string> {
    const source = this.config.get<string>('ELIF_PRICE_SOURCE', 'prompt');
    if (source !== 'packages') {
      return PROMPT_PRICE_TABLE;
    }

    const packages = await this.prisma.package.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    const formatter = new Intl.NumberFormat(TR_LOCALE, {
      maximumFractionDigits: 2,
    });
    return packages
      .map(
        (pkg) =>
          `${pkg.name} · ${pkg.sessionCount} seans · ${formatter.format(Number(pkg.price.toString()))} TL`,
      )
      .join('\n');
  }

  buildKnowledgeContext(items: KnowledgeContextItem[]): string {
    if (items.length === 0) {
      return '';
    }
    const body = items
      .map((item) => `Soru: ${item.title}\nCevap: ${item.content}`)
      .join('\n\n');
    return `[BİLGİ BANKASI — yalnızca aşağıdaki bilgilere dayanarak cevap ver]\n${body}`;
  }

  buildChannelTag(channel: Channel, phone?: string | null): string {
    // Telefon numarasının kendisi modele gönderilmez (KVKK); yalnızca var/yok bilgisi.
    const hasPhone = !!phone;
    if (channel === Channel.WHATSAPP) {
      return `[KANAL: WhatsApp · Müşterinin telefon numarası ${hasPhone ? 'sistemde mevcut' : 'yok'}.]`;
    }
    return `[KANAL: Instagram DM · Müşterinin telefon numarası ${hasPhone ? 'sistemde mevcut' : 'sistemde YOK'}.]`;
  }

  buildNowTag(date: Date): string {
    const parts = new Intl.DateTimeFormat(TR_LOCALE, {
      timeZone: ISTANBUL_TZ,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    const day = value('day');
    const month = value('month');
    const year = value('year');
    const weekday = value('weekday');
    const hour = value('hour');
    const minute = value('minute');
    return `[ŞU AN: ${day} ${month} ${year} ${weekday} ${hour}:${minute}, ${ISTANBUL_TZ}]`;
  }
}
