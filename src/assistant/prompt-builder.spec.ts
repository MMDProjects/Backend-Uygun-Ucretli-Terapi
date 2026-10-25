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
// prompt.md repo dışında; CI'da yoksa yalnızca karşılaştırma testi atlanır
const hasPromptMd = fs.existsSync(PROMPT_MD_PATH);

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
    it('boş listede kayıt bulunamadı notunu döndürür', () => {
      const { builder } = build();
      const result = builder.buildKnowledgeContext([]);
      expect(result).toContain('kayıt bulunamadı');
      expect(result).toContain("'bilinmeyen_konu'");
    });

    it('bilgi maddelerini soru-cevap olarak bloğa çevirir', () => {
      const { builder } = build();
      const result = builder.buildKnowledgeContext([
        { title: 'Konum', content: 'Online platform' },
      ]);

      expect(result).toContain('Soru: Konum');
      expect(result).toContain('Cevap: Online platform');
      expect(result).toContain('öncelikli kaynak');
    });

    it('içeriği zaten Soru: ile başlayan SSS kaydını ikinci kez etiketlemez', () => {
      const { builder } = build();
      const result = builder.buildKnowledgeContext([
        {
          title: 'Ücret nedir?',
          content: 'Soru: Ücret nedir?\nCevap: 500 TL',
        },
      ]);

      expect(result.match(/Soru:/g)).toHaveLength(1);
      expect(result).not.toContain('Cevap: Soru:');
    });

    it('her kaydı en fazla 1200 karakter olarak verir', () => {
      const { builder } = build();
      const result = builder.buildKnowledgeContext([
        { title: 'Uzun', content: 'a'.repeat(3000) },
      ]);

      expect(result.length).toBeLessThan(1400);
    });
  });

  describe('buildChannelTag', () => {
    it('WhatsApp için numarayı yazmadan yalnızca var/yok bilgisini üretir', () => {
      const { builder } = build();
      const tag = builder.buildChannelTag(Channel.WHATSAPP, '905550001122');
      expect(tag).toBe(
        '[KANAL: WhatsApp · Müşterinin telefon numarası sistemde mevcut.]',
      );
      expect(tag).not.toMatch(/d{4}/);
    });

    it('WhatsApp numarası yoksa bunu belirtir', () => {
      const { builder } = build();
      expect(builder.buildChannelTag(Channel.WHATSAPP, null)).toBe(
        '[KANAL: WhatsApp · Müşterinin telefon numarası yok.]',
      );
    });

    it('Instagram için numarasız kanal etiketini üretir', () => {
      const { builder } = build();
      expect(builder.buildChannelTag(Channel.INSTAGRAM, null)).toBe(
        '[KANAL: Instagram DM · Müşterinin telefon numarası sistemde YOK.]',
      );
    });

    it('Instagram numarası kayıtlıysa yalnızca varlığını belirtir', () => {
      const { builder } = build();
      const tag = builder.buildChannelTag(Channel.INSTAGRAM, '905550001122');
      expect(tag).toBe(
        '[KANAL: Instagram DM · Müşterinin telefon numarası sistemde mevcut.]',
      );
      expect(tag).not.toMatch(/d{4}/);
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
    (hasPromptMd ? it : it.skip)(
      'prompt.md fiyat tablosu dışındaki tüm metni ELIF_SYSTEM_PROMPT içinde taşır',
      () => {
        const normalize = (text: string) => text.replace(/\r\n/g, '\n');
        const source = normalize(fs.readFileSync(PROMPT_MD_PATH, 'utf8'));
        const rebuilt = normalize(
          ELIF_SYSTEM_PROMPT.replace(
            PRICE_PLACEHOLDER,
            () => PROMPT_PRICE_TABLE,
          ),
        );

        expect(rebuilt).toBe(source);
      },
    );

    it('CRISIS_MESSAGE sabiti tanımlı ve boş değil', () => {
      expect(CRISIS_MESSAGE.length).toBeGreaterThan(0);
      expect(CRISIS_MESSAGE).toContain('112');
    });
  });
});

describe('PromptBuilder.buildChannelAddendum', () => {
  const builder = new PromptBuilder(
    buildPrismaMock() as unknown as PrismaService,
    buildConfigMock() as unknown as ConfigService,
  );
  const ADDENDA = {
    whatsappAddendum: 'WA KURAL',
    instagramAddendum: 'IG KURAL',
  };

  it('WhatsApp kanalında yalnız WhatsApp eklenir ve başlık konur', () => {
    expect(builder.buildChannelAddendum(Channel.WHATSAPP, ADDENDA)).toBe(
      '\n\n[KANALA ÖZEL TALİMATLAR — WhatsApp]\nWA KURAL',
    );
  });

  it('Instagram kanalında yalnız Instagram eklenir ve başlık konur', () => {
    expect(builder.buildChannelAddendum(Channel.INSTAGRAM, ADDENDA)).toBe(
      '\n\n[KANALA ÖZEL TALİMATLAR — Instagram]\nIG KURAL',
    );
  });

  it('ilgili kanalın eki boşsa boş metin döner (başlık yok)', () => {
    expect(
      builder.buildChannelAddendum(Channel.WHATSAPP, {
        whatsappAddendum: null,
        instagramAddendum: 'IG KURAL',
      }),
    ).toBe('');
    expect(
      builder.buildChannelAddendum(Channel.INSTAGRAM, {
        whatsappAddendum: 'WA KURAL',
        instagramAddendum: '   ',
      }),
    ).toBe('');
  });

  it('WEB kanalında ek uygulanmaz', () => {
    expect(builder.buildChannelAddendum(Channel.WEB, ADDENDA)).toBe('');
  });
});
