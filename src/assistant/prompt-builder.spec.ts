import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { Channel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PromptBuilder } from './prompt-builder';
import {
  ELIF_SYSTEM_PROMPT,
  PROMPT_PRICE_TABLE,
} from './prompts/elif-system-prompt';
import { CRISIS_MESSAGE } from './crisis-message';

const PRICE_PLACEHOLDER = '{{FIYAT_TABLOSU}}';
const PROMPT_MD_PATH = path.resolve(__dirname, '../../../prompt.md');

function buildPrismaMock() {
  return {
    package: {
      findMany: jest.fn<any, any>(),
    },
  };
}

function buildConfigMock(values: Record<string, string> = {}) {
  return {
    get: jest.fn(
      (key: string, defaultValue?: string) => values[key] ?? defaultValue,
    ),
  };
}

describe('PromptBuilder', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;

  function build(configValues: Record<string, string> = {}) {
    const config = buildConfigMock(configValues);
    const builder = new PromptBuilder(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    return { builder, config };
  }

  beforeEach(() => {
    prisma = buildPrismaMock();
  });

  describe('buildSystemPrompt', () => {
    it('{{FIYAT_TABLOSU}} yerine verilen fiyat tablosunu koyar', () => {
      const { builder } = build();
      const result = builder.buildSystemPrompt('ÖZEL TABLO');

      expect(result).toContain('ÖZEL TABLO');
      expect(result).not.toContain(PRICE_PLACEHOLDER);
    });

    it('fiyat tablosundaki $ karakterlerini özel replace kalıbı olarak yorumlamaz', () => {
      const { builder } = build();
      const result = builder.buildSystemPrompt("$& ve $' test");

      expect(result).toContain("$& ve $' test");
    });
  });

  describe('buildPriceTable', () => {
    it('ELIF_PRICE_SOURCE varsayılanı (prompt) iken orijinal tabloyu birebir döndürür ve Package tablosunu okumaz', async () => {
      const { builder } = build();
      const table = await builder.buildPriceTable();

      expect(table).toBe(PROMPT_PRICE_TABLE);
      expect(prisma.package.findMany).not.toHaveBeenCalled();
    });

    it('ELIF_PRICE_SOURCE=packages iken Package tablosundan sortOrder sırasıyla tr-TR binlik ayırıcılı satırlar üretir', async () => {
      prisma.package.findMany.mockResolvedValue([
        {
          name: 'Bireysel',
          sessionCount: 5,
          price: new Prisma.Decimal('5500'),
        },
        { name: 'Çift', sessionCount: 10, price: new Prisma.Decimal('1200.5') },
      ]);
      const { builder } = build({ ELIF_PRICE_SOURCE: 'packages' });

      const table = await builder.buildPriceTable();

      expect(prisma.package.findMany).toHaveBeenCalledWith({
        orderBy: { sortOrder: 'asc' },
      });
      expect(table).toBe(
        'Bireysel · 5 seans · 5.500 TL\nÇift · 10 seans · 1.200,5 TL',
      );
    });
  });

  describe('buildKnowledgeContext', () => {
    it('boş liste için boş string döndürür', () => {
      const { builder } = build();
      expect(builder.buildKnowledgeContext([])).toBe('');
    });

    it('bilgi maddelerini soru-cevap olarak bloğa çevirir', () => {
      const { builder } = build();
      const result = builder.buildKnowledgeContext([
        { title: 'Konum', content: 'Online platform' },
      ]);

      expect(result).toContain('Soru: Konum');
      expect(result).toContain('Cevap: Online platform');
    });
  });

  describe('buildChannelTag', () => {
    it('WhatsApp için prompttaki numaralı kanal etiketini birebir üretir', () => {
      const { builder } = build();
      expect(builder.buildChannelTag(Channel.WHATSAPP, '905550001122')).toBe(
        '[KANAL: WhatsApp · Müşterinin numarası: 905550001122]',
      );
    });

    it('Instagram için prompttaki numarasız kanal etiketini birebir üretir', () => {
      const { builder } = build();
      expect(builder.buildChannelTag(Channel.INSTAGRAM, null)).toBe(
        '[KANAL: Instagram DM · Müşterinin telefon numarası sistemde YOK.]',
      );
    });
  });

  describe('buildNowTag', () => {
    it('Europe/Istanbul saatiyle [ŞU AN: ...] etiketi üretir', () => {
      const { builder } = build();
      // 2026-10-22 11:35 UTC = 14:35 Europe/Istanbul (UTC+3, DST yok); gün Perşembe.
      const date = new Date('2026-10-22T11:35:00Z');

      expect(builder.buildNowTag(date)).toBe(
        '[ŞU AN: 22 Ekim 2026 Perşembe 14:35, Europe/Istanbul]',
      );
    });
  });

  describe('prompt dosyası', () => {
    it('prompt.md fiyat tablosu dışındaki tüm metni ELIF_SYSTEM_PROMPT içinde taşır', () => {
      const normalize = (text: string) => text.replace(/\r\n/g, '\n');
      const source = normalize(fs.readFileSync(PROMPT_MD_PATH, 'utf8'));
      const rebuilt = normalize(
        ELIF_SYSTEM_PROMPT.replace(PRICE_PLACEHOLDER, () => PROMPT_PRICE_TABLE),
      );

      expect(rebuilt).toBe(source);
    });

    it('CRISIS_MESSAGE sabiti tanımlı ve boş değil', () => {
      expect(CRISIS_MESSAGE.length).toBeGreaterThan(0);
      expect(CRISIS_MESSAGE).toContain('112');
    });
  });
});
