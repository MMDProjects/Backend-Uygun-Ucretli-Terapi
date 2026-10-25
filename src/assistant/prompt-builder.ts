import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PromptAddenda } from './prompt-versions.service';
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
const QUESTION_PREFIX = 'Soru:';
const KNOWLEDGE_ITEM_MAX_CHARS = 1200;
const KNOWLEDGE_HEADER =
  '[BİLGİ BANKASI — ilgili kayıtlar; öncelikli kaynak. Prompttaki kurallar her zaman geçerli.]';
const NO_KNOWLEDGE_NOTE =
  "[BİLGİ BANKASI — bu konuda kayıt bulunamadı. Cevap yukarıdaki sistem bilgilerinde yoksa tahmin etme; personel_aktar_tool ile 'bilinmeyen_konu' sebebiyle devret.]";

@Injectable()
export class PromptBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // template: aktif prompt içeriği (veritabanı ya da kod içi varsayılan).
  buildSystemPrompt(
    priceTable: string,
    template: string = ELIF_SYSTEM_PROMPT,
  ): string {
    return template.replace(PRICE_PLACEHOLDER, () => priceTable);
  }

  // Kanala özel ek: yalnızca o kanalın konuşmasında, boş değilse. Boşsa başlık da eklenmez.
  buildChannelAddendum(channel: Channel, addenda: PromptAddenda): string {
    const target =
      channel === Channel.WHATSAPP
        ? { label: 'WhatsApp', text: addenda.whatsappAddendum }
        : channel === Channel.INSTAGRAM
          ? { label: 'Instagram', text: addenda.instagramAddendum }
          : null;
    const text = target?.text?.trim();
    if (!target || !text) {
      return '';
    }
    return `\n\n[KANALA ÖZEL TALİMATLAR — ${target.label}]\n${text}`;
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
      return NO_KNOWLEDGE_NOTE;
    }
    const body = items
      .map((item) => {
        // SSS kayıtları zaten "Soru:/Cevap:" biçiminde; ikinci kez etiketlenmez.
        const text = item.content.startsWith(QUESTION_PREFIX)
          ? item.content
          : `${QUESTION_PREFIX} ${item.title}\nCevap: ${item.content}`;
        return text.slice(0, KNOWLEDGE_ITEM_MAX_CHARS);
      })
      .join('\n\n');
    return `${KNOWLEDGE_HEADER}\n${body}`;
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
