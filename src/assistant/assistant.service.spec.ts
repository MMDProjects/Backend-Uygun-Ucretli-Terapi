import { ConfigService } from '@nestjs/config';
import {
  AssistantService,
  MEDIA_REPLY,
  splitForChannel,
} from './assistant.service';
import { OpenAiUnavailableError } from './openai.client';
import { CRISIS_MESSAGE } from './crisis-message';
import { PrismaService } from '../prisma/prisma.service';

const CONVERSATION = {
  id: 'conv-1',
  channel: 'WHATSAPP',
  isBotActive: true,
  flaggedCrisis: false,
  contact: {
    id: 'contact-1',
    phone: '905550001122',
    instagramId: null,
    contactType: 'DANISAN',
    noticeSentAt: null,
  },
};

function buildPrismaMock() {
  return {
    conversation: {
      findUnique: jest.fn<any, any>().mockResolvedValue(CONVERSATION),
      update: jest.fn<any, any>().mockResolvedValue({}),
    },
    contact: {
      update: jest.fn<any, any>().mockResolvedValue({}),
    },
    message: {
      findMany: jest
        .fn<any, any>()
        .mockResolvedValue([
          { senderType: 'CLIENT', content: 'Merhaba, randevu almak istiyorum' },
        ]),
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
      count: jest.fn<any, any>().mockResolvedValue(0),
      create: jest.fn<any, any>().mockResolvedValue({}),
    },
  };
}

const PHONE_CONTACT = {
  id: 'contact-1',
  phone: '905550001122',
  instagramId: null,
  contactType: 'DANISAN',
  noticeSentAt: null,
};

type Mode = 'OFF' | 'SHADOW' | 'LIVE';

function buildDeps(
  mode: Mode = 'LIVE',
  overrides: Record<string, string> = {},
) {
  const prisma = buildPrismaMock();
  const settings: Record<string, string> = {
    ASSISTANT_DEBOUNCE_MS: '0',
    ...overrides,
  };
  const config = {
    get: jest.fn((key: string, def?: string) => {
      if (key in settings) return settings[key];
      return def;
    }),
  } as unknown as ConfigService;
  const openai = { chat: jest.fn<any, any>() };
  const knowledge = {
    search: jest.fn<any, any>().mockResolvedValue({
      items: [{ id: 'kb-1', title: 'Soru', content: 'Cevap', score: 0.9 }],
      topScore: 0.9,
    }),
    recordUnanswered: jest.fn<any, any>().mockResolvedValue(undefined),
  };
  const promptBuilder = {
    buildPriceTable: jest.fn<any, any>().mockResolvedValue('TABLO'),
    buildSystemPrompt: jest.fn<any, any>().mockReturnValue('SYSTEM'),
    buildKnowledgeContext: jest.fn<any, any>().mockReturnValue('BILGI'),
    buildChannelTag: jest.fn<any, any>().mockReturnValue('[KANAL]'),
    buildNowTag: jest.fn<any, any>().mockReturnValue('[ŞU AN]'),
  };
  const leads = { createFromTool: jest.fn<any, any>() };
  const handoffService = {
    handoff: jest.fn<any, any>().mockResolvedValue(undefined),
  };
  const metaSender = {
    sendText: jest.fn<any, any>().mockResolvedValue({ ok: true }),
  };
  const notifications = {
    notifyAdmins: jest.fn<any, any>().mockResolvedValue(undefined),
  };
  const inboxEvents = { emit: jest.fn<any, any>() };
  const settingsService = {
    getEffectiveMode: jest.fn<any, any>().mockResolvedValue(mode),
    getSettings: jest.fn<any, any>().mockResolvedValue({ noticeText: null }),
  };
  const crisisAlert = {
    alert: jest.fn<any, any>().mockResolvedValue(undefined),
  };

  const service = new AssistantService(
    prisma as unknown as PrismaService,
    config,
    openai as any,
    knowledge as any,
    promptBuilder as any,
    leads as any,
    handoffService as any,
    metaSender as any,
    notifications as any,
    inboxEvents as any,
    settingsService as any,
    crisisAlert as any,
  );

  return {
    service,
    prisma,
    openai,
    knowledge,
    leads,
    handoffService,
    metaSender,
    notifications,
    inboxEvents,
    settingsService,
    crisisAlert,
  };
}

describe('AssistantService', () => {
  describe('mod OFF iken', () => {
    it('handleIncoming hiçbir şey çağırmaz', async () => {
      const deps = buildDeps('OFF');

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.prisma.conversation.findUnique).not.toHaveBeenCalled();
      expect(deps.knowledge.search).not.toHaveBeenCalled();
      expect(deps.openai.chat).not.toHaveBeenCalled();
      expect(deps.metaSender.sendText).not.toHaveBeenCalled();
      expect(deps.handoffService.handoff).not.toHaveBeenCalled();
    });

    it('handleCrisis danışana mesaj göndermez ama personeli bilgilendirir', async () => {
      const deps = buildDeps('OFF');

      await deps.service.handleCrisis('conv-1');

      expect(deps.metaSender.sendText).not.toHaveBeenCalled();
      expect(deps.prisma.message.create).not.toHaveBeenCalled();
      expect(deps.notifications.notifyAdmins).toHaveBeenCalledWith(
        'DANGER_PANIC',
        expect.any(String),
      );
    });
  });

  describe('handleIncoming', () => {
    it('bot pasifse veya kriz işaretliyse LLM çağrılmaz', async () => {
      const deps = buildDeps('LIVE');
      deps.prisma.conversation.findUnique.mockResolvedValueOnce({
        ...CONVERSATION,
        isBotActive: false,
      });

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.openai.chat).not.toHaveBeenCalled();
      expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    });

    it('bilgi bankasında eşleşme yoksa soruyu bilinmeyenlere kaydeder', async () => {
      const deps = buildDeps('LIVE');
      deps.prisma.message.findMany.mockResolvedValue([]);
      deps.knowledge.search.mockResolvedValueOnce({ items: [], topScore: 0.1 });
      deps.openai.chat.mockResolvedValueOnce({
        content: 'Cevap',
        toolCalls: [],
      });

      await deps.service.handleIncoming('conv-1', 'Bilinmeyen soru');

      expect(deps.knowledge.recordUnanswered).toHaveBeenCalledWith(
        'conv-1',
        'Bilinmeyen soru',
        0.1,
      );
    });

    it('lead_tool çağrısını çalıştırır, tool sonucunu geri verir ve final metni gönderir', async () => {
      const deps = buildDeps('LIVE');
      deps.openai.chat
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              name: 'lead_tool',
              arguments: JSON.stringify({
                hizmet: 'bireysel',
                ad_soyad: 'Ayşe Yılmaz',
                arama_saati: '14:00',
                ozet: 'Bireysel görüşme',
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          content: 'Teşekkürler, sizi arayacağız.',
          toolCalls: [],
        });
      deps.leads.createFromTool.mockResolvedValueOnce({
        ok: true,
        message: 'Arama talebi kaydedildi.',
      });

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.leads.createFromTool).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'conv-1', channel: 'WHATSAPP' }),
        CONVERSATION.contact,
        expect.objectContaining({
          ad_soyad: 'Ayşe Yılmaz',
          hizmet: 'bireysel',
        }),
      );

      const secondCallMessages = deps.openai.chat.mock.calls[1][0].messages;
      expect(secondCallMessages).toContainEqual({
        role: 'tool',
        tool_call_id: 'call-1',
        content: 'Arama talebi kaydedildi.',
      });

      expect(deps.metaSender.sendText).toHaveBeenCalledWith(
        'WHATSAPP',
        '905550001122',
        'Teşekkürler, sizi arayacağız.',
      );
      expect(deps.prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderType: 'BOT',
          content: 'Teşekkürler, sizi arayacağız.',
          metaMessageId: null,
        },
      });
    });

    it('personel_aktar_tool devir yapar', async () => {
      const deps = buildDeps('LIVE');
      deps.openai.chat
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [
            {
              id: 'call-2',
              name: 'personel_aktar_tool',
              arguments: JSON.stringify({
                sebep: 'sikayet',
                ozet: 'Şikayet var',
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          content: 'Ekibimiz ilgilenecek.',
          toolCalls: [],
        });

      await deps.service.handleIncoming('conv-1', 'Şikayetim var');

      expect(deps.handoffService.handoff).toHaveBeenCalledWith(
        'conv-1',
        'sikayet',
        'Şikayet var',
      );
    });

    it('OpenAI hatasında konuşmayı personele devreder, danışana mesaj göndermez', async () => {
      const deps = buildDeps('LIVE');
      deps.openai.chat.mockRejectedValueOnce(new OpenAiUnavailableError());

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.handoffService.handoff).toHaveBeenCalledWith(
        'conv-1',
        'bilinmeyen_konu',
        'Asistan hata verdi',
      );
      expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    });

    it('yanıt Meta’ya gönderilemezse personele devreder, BOT mesajı kaydetmez', async () => {
      const deps = buildDeps('LIVE');
      deps.openai.chat.mockResolvedValueOnce({
        content: 'Cevap',
        toolCalls: [],
      });
      deps.metaSender.sendText.mockResolvedValueOnce({ ok: false });

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.handoffService.handoff).toHaveBeenCalledWith(
        'conv-1',
        'bilinmeyen_konu',
        'Asistan yanıtı danışana gönderilemedi',
      );
      expect(deps.prisma.message.create).not.toHaveBeenCalled();
    });

    it('LLM çalışırken personel devraldıysa bot yanıtını göndermez', async () => {
      const deps = buildDeps('LIVE');
      deps.openai.chat.mockResolvedValueOnce({
        content: 'Cevap',
        toolCalls: [],
      });
      deps.prisma.conversation.findUnique
        .mockResolvedValueOnce(CONVERSATION)
        .mockResolvedValueOnce({ isBotActive: false });

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.metaSender.sendText).not.toHaveBeenCalled();
      expect(deps.prisma.message.create).not.toHaveBeenCalled();
      expect(deps.handoffService.handoff).not.toHaveBeenCalled();
    });

    it('personel_aktar_tool ile kendisi devrettiyse bilgilendirme mesajını yine gönderir', async () => {
      const deps = buildDeps('LIVE');
      deps.openai.chat
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [
            {
              id: 'call-3',
              name: 'personel_aktar_tool',
              arguments: JSON.stringify({ sebep: 'sikayet', ozet: 'Şikayet' }),
            },
          ],
        })
        .mockResolvedValueOnce({
          content: 'Ekibimize iletiyorum.',
          toolCalls: [],
        });
      deps.prisma.conversation.findUnique
        .mockResolvedValueOnce(CONVERSATION)
        .mockResolvedValue({ isBotActive: false });

      await deps.service.handleIncoming('conv-1', 'Şikayetim var');

      expect(deps.metaSender.sendText).toHaveBeenCalledWith(
        'WHATSAPP',
        '905550001122',
        'Ekibimize iletiyorum.',
      );
    });

    it('aynı konuşmadaki mesajları sıralı işler', async () => {
      const deps = buildDeps('LIVE');
      const order: string[] = [];
      deps.openai.chat.mockImplementation(async ({ messages }: any) => {
        const last = messages[messages.length - 1].content as string;
        order.push(`start:${last}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`end:${last}`);
        return { content: 'ok', toolCalls: [] };
      });

      await Promise.all([
        deps.service.handleIncoming('conv-1', 'ilk'),
        deps.service.handleIncoming('conv-1', 'ikinci'),
      ]);

      expect(order[0]).toMatch(/^start:/);
      expect(order[1]).toMatch(/^end:/);
      expect(order[2]).toMatch(/^start:/);
      expect(order[3]).toMatch(/^end:/);
    });
  });

  describe('handleCrisis', () => {
    it('kilit açıkken acil mesajı gönderir, BOT mesajı kaydeder ve DANGER_PANIC bildirir', async () => {
      const deps = buildDeps('LIVE');
      deps.metaSender.sendText.mockResolvedValueOnce({
        ok: true,
        messageId: 'wamid-c1',
      });

      await deps.service.handleCrisis('conv-1');

      expect(deps.metaSender.sendText).toHaveBeenCalledWith(
        'WHATSAPP',
        '905550001122',
        CRISIS_MESSAGE,
      );
      expect(deps.prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderType: 'BOT',
          content: CRISIS_MESSAGE,
          metaMessageId: 'wamid-c1',
        },
      });
      expect(deps.notifications.notifyAdmins).toHaveBeenCalledWith(
        'DANGER_PANIC',
        expect.any(String),
      );
      expect(deps.inboxEvents.emit).toHaveBeenCalledWith('message.created', {
        conversationId: 'conv-1',
        message: {},
      });
    });
  });
});

const realTimers = jest.requireActual<typeof import('timers')>('timers');
const flushPromises = () =>
  new Promise<void>((resolve) => realTimers.setImmediate(() => resolve()));
const MEDIA = '[desteklenmeyen mesaj tipi: audio]';

describe('bekleme süresi (debounce)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('art arda mesajlarda tek tur çalışır ve sorgu mesajları birleştirir', async () => {
    const deps = buildDeps('LIVE', { ASSISTANT_DEBOUNCE_MS: '5000' });
    deps.prisma.message.findMany.mockResolvedValue([
      { senderType: 'CLIENT', content: 'randevu' },
      { senderType: 'CLIENT', content: 'saat kaçta' },
      { senderType: 'CLIENT', content: 'yarın mı' },
    ]);
    deps.openai.chat.mockResolvedValue({ content: 'ok', toolCalls: [] });

    void deps.service.handleIncoming('conv-1', 'randevu');
    jest.advanceTimersByTime(3000);
    void deps.service.handleIncoming('conv-1', 'saat kaçta');
    jest.advanceTimersByTime(3000);
    void deps.service.handleIncoming('conv-1', 'yarın mı');
    jest.advanceTimersByTime(4999);
    await flushPromises();
    expect(deps.openai.chat).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushPromises();
    expect(deps.openai.chat).toHaveBeenCalledTimes(1);
    expect(deps.knowledge.search).toHaveBeenCalledWith(
      'randevu\nsaat kaçta\nyarın mı',
    );
  });

  it('bekleme sırasında gelen metin, medya turunu metin turuna çevirir', async () => {
    const deps = buildDeps('LIVE', { ASSISTANT_DEBOUNCE_MS: '5000' });
    deps.openai.chat.mockResolvedValue({ content: 'ok', toolCalls: [] });

    void deps.service.handleIncoming('conv-1', MEDIA, { kind: 'unsupported' });
    void deps.service.handleIncoming('conv-1', 'Merhaba');
    jest.advanceTimersByTime(5000);
    await flushPromises();

    expect(deps.openai.chat).toHaveBeenCalledTimes(1);
    expect(deps.metaSender.sendText).toHaveBeenCalledWith(
      'WHATSAPP',
      '905550001122',
      'ok',
    );
  });

  it('kriz geldiğinde bekleyen turu iptal eder', async () => {
    const deps = buildDeps('LIVE', { ASSISTANT_DEBOUNCE_MS: '5000' });

    void deps.service.handleIncoming('conv-1', 'Merhaba');
    await deps.service.handleCrisis('conv-1');
    jest.advanceTimersByTime(10000);
    await flushPromises();

    expect(deps.openai.chat).not.toHaveBeenCalled();
    expect(deps.notifications.notifyAdmins).toHaveBeenCalledWith(
      'DANGER_PANIC',
      expect.any(String),
    );
  });
});

describe('tekrar eden kriz', () => {
  it('danışana mesaj göndermez, yalnız personeli bilgilendirir', async () => {
    const deps = buildDeps('LIVE');

    await deps.service.handleCrisis('conv-1', { repeat: true });

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.message.create).not.toHaveBeenCalled();
    expect(deps.notifications.notifyAdmins).toHaveBeenCalledWith(
      'DANGER_PANIC',
      expect.stringContaining('Kriz konuşmasında yeni kriz ifadesi'),
    );
  });
});

describe('desteklenmeyen mesajlar (medya)', () => {
  it('ilk medya mesajında sabit cevap gönderir, LLM ve bilgi bankasını çağırmaz', async () => {
    const deps = buildDeps('LIVE');
    deps.metaSender.sendText.mockResolvedValueOnce({
      ok: true,
      messageId: 'wamid-m1',
    });

    await deps.service.handleIncoming('conv-1', MEDIA, { kind: 'unsupported' });

    expect(deps.metaSender.sendText).toHaveBeenCalledWith(
      'WHATSAPP',
      '905550001122',
      MEDIA_REPLY,
    );
    expect(deps.prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        senderType: 'BOT',
        content: MEDIA_REPLY,
        metaMessageId: 'wamid-m1',
      },
    });
    expect(deps.openai.chat).not.toHaveBeenCalled();
    expect(deps.knowledge.search).not.toHaveBeenCalled();
    expect(deps.knowledge.recordUnanswered).not.toHaveBeenCalled();
  });

  it('ikinci medya mesajında konuşmayı personele devreder', async () => {
    const deps = buildDeps('LIVE');
    deps.prisma.message.findFirst.mockResolvedValueOnce({ id: 'msg-1' });

    await deps.service.handleIncoming('conv-1', MEDIA, { kind: 'unsupported' });

    expect(deps.handoffService.handoff).toHaveBeenCalledWith(
      'conv-1',
      'bilinmeyen_konu',
      'Danışan medya mesajı gönderiyor (sesli mesaj/görsel)',
    );
    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.openai.chat).not.toHaveBeenCalled();
  });

  it('geçmişteki desteklenmeyen mesajlar LLM mesajlarına girmez', async () => {
    const deps = buildDeps('LIVE');
    deps.prisma.message.findMany.mockResolvedValue([
      { senderType: 'CLIENT', content: MEDIA },
      { senderType: 'BOT', content: 'Önceki cevap' },
      { senderType: 'CLIENT', content: 'Merhaba' },
    ]);
    deps.openai.chat.mockResolvedValueOnce({ content: 'Cevap', toolCalls: [] });

    await deps.service.handleIncoming('conv-1', 'Yeni soru');

    const messages = deps.openai.chat.mock.calls[0][0].messages;
    expect(JSON.stringify(messages)).not.toContain('desteklenmeyen mesaj tipi');
    expect(messages).toContainEqual(
      expect.objectContaining({ role: 'assistant', content: 'Önceki cevap' }),
    );
  });
});

describe('saatlik cevap sınırı', () => {
  it('sınır aşılınca LLM çağrılmaz ve personele devredilir', async () => {
    const deps = buildDeps('LIVE');
    deps.prisma.message.count.mockResolvedValueOnce(20);

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.openai.chat).not.toHaveBeenCalled();
    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.handoffService.handoff).toHaveBeenCalledWith(
      'conv-1',
      'bilinmeyen_konu',
      'Saatlik bot cevap sınırı aşıldı',
    );
  });
});

describe('Instagram mesaj bölme', () => {
  const INSTAGRAM_CONVERSATION = {
    ...CONVERSATION,
    channel: 'INSTAGRAM',
    contact: { ...PHONE_CONTACT, phone: null, instagramId: 'igsid-1' },
  };

  it('uzun cevabı parçalara böler ve her parçayı kendi kimliğiyle kaydeder', async () => {
    const deps = buildDeps('LIVE', { INSTAGRAM_MAX_CHARS: '1000' });
    deps.prisma.conversation.findUnique.mockResolvedValue(
      INSTAGRAM_CONVERSATION,
    );
    deps.openai.chat.mockResolvedValueOnce({
      content: `${'A'.repeat(600)}\n\n${'B'.repeat(600)}`,
      toolCalls: [],
    });
    deps.metaSender.sendText
      .mockResolvedValueOnce({ ok: true, messageId: 'ig-1' })
      .mockResolvedValueOnce({ ok: true, messageId: 'ig-2' });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.metaSender.sendText).toHaveBeenNthCalledWith(
      1,
      'INSTAGRAM',
      'igsid-1',
      'A'.repeat(600),
    );
    expect(deps.metaSender.sendText).toHaveBeenNthCalledWith(
      2,
      'INSTAGRAM',
      'igsid-1',
      'B'.repeat(600),
    );
    expect(deps.prisma.message.create).toHaveBeenNthCalledWith(1, {
      data: {
        conversationId: 'conv-1',
        senderType: 'BOT',
        content: 'A'.repeat(600),
        metaMessageId: 'ig-1',
      },
    });
    expect(deps.prisma.message.create).toHaveBeenNthCalledWith(2, {
      data: {
        conversationId: 'conv-1',
        senderType: 'BOT',
        content: 'B'.repeat(600),
        metaMessageId: 'ig-2',
      },
    });
  });

  it('bir parça başarısız olursa kalanları göndermez ve personele devreder', async () => {
    const deps = buildDeps('LIVE', { INSTAGRAM_MAX_CHARS: '1000' });
    deps.prisma.conversation.findUnique.mockResolvedValue(
      INSTAGRAM_CONVERSATION,
    );
    deps.openai.chat.mockResolvedValueOnce({
      content: ['A'.repeat(600), 'B'.repeat(600), 'C'.repeat(600)].join('\n\n'),
      toolCalls: [],
    });
    deps.metaSender.sendText
      .mockResolvedValueOnce({ ok: true, messageId: 'ig-1' })
      .mockResolvedValueOnce({ ok: false });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.metaSender.sendText).toHaveBeenCalledTimes(2);
    expect(deps.prisma.message.create).toHaveBeenCalledTimes(1);
    expect(deps.handoffService.handoff).toHaveBeenCalledWith(
      'conv-1',
      'bilinmeyen_konu',
      'Asistan yanıtı danışana gönderilemedi',
    );
  });
});

describe('splitForChannel', () => {
  it('sınır içindeki metni olduğu gibi döndürür', () => {
    expect(splitForChannel('Merhaba', 10)).toEqual(['Merhaba']);
  });

  it('önce boş satırdan böler', () => {
    expect(splitForChannel('aaaaa\n\nbbbbb', 8)).toEqual(['aaaaa', 'bbbbb']);
  });

  it('boş satır yoksa cümle sonundan böler', () => {
    expect(splitForChannel('Bir cümle. İkinci cümle burada.', 12)).toEqual([
      'Bir cümle.',
      'İkinci cümle',
      'burada.',
    ]);
  });

  it('cümle sonu da yoksa boşluktan, boşluk da yoksa sert böler', () => {
    expect(splitForChannel('x'.repeat(25), 10)).toEqual([
      'x'.repeat(10),
      'x'.repeat(10),
      'x'.repeat(5),
    ]);
  });

  it('hiçbir parça sınırı aşmaz ve metni bozmaz', () => {
    const text = Array.from({ length: 300 }, (_, i) => `Cümle ${i}.`).join(' ');
    const parts = splitForChannel(text, 1000);
    expect(parts.every((part) => part.length <= 1000)).toBe(true);
    expect(parts.join(' ')).toBe(text);
  });
});

describe('gölge mod (SHADOW)', () => {
  it('cevabı göndermez, taslak olarak kaydeder ve lastMessageAt güncellemez', async () => {
    const deps = buildDeps('SHADOW');
    deps.openai.chat.mockResolvedValueOnce({
      content: 'Taslak cevap',
      toolCalls: [],
    });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        senderType: 'BOT',
        content: 'Taslak cevap',
        isDraft: true,
        draftMeta: { mode: 'SHADOW', tools: [] },
      },
    });
    expect(deps.prisma.conversation.update).not.toHaveBeenCalled();
    expect(deps.inboxEvents.emit).toHaveBeenCalledWith(
      'message.created',
      expect.objectContaining({ conversationId: 'conv-1' }),
    );
    expect(deps.handoffService.handoff).not.toHaveBeenCalled();
  });

  it('araçları çalıştırmaz, çağrıları draftMeta.tools içine yazar', async () => {
    const deps = buildDeps('SHADOW');
    const leadArgs = {
      hizmet: 'bireysel',
      ad_soyad: 'Ayşe Yılmaz',
      arama_saati: '14:00',
      ozet: 'Bireysel görüşme',
    };
    const handoffArgs = { sebep: 'sikayet', ozet: 'Özet' };
    deps.openai.chat
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            name: 'lead_tool',
            arguments: JSON.stringify(leadArgs),
          },
          {
            id: 'call-2',
            name: 'personel_aktar_tool',
            arguments: JSON.stringify(handoffArgs),
          },
        ],
      })
      .mockResolvedValueOnce({ content: 'Taslak metin', toolCalls: [] });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.leads.createFromTool).not.toHaveBeenCalled();
    expect(deps.handoffService.handoff).not.toHaveBeenCalled();
    expect(deps.openai.chat.mock.calls[1][0].messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content:
        'Gölge mod: işlem kaydedilmedi, danışana normal şekilde cevap yaz.',
    });
    expect(deps.prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: 'Taslak metin',
        isDraft: true,
        draftMeta: {
          mode: 'SHADOW',
          tools: [
            { name: 'lead_tool', args: leadArgs },
            { name: 'personel_aktar_tool', args: handoffArgs },
          ],
        },
      }),
    });
  });

  it('taslak turda saatlik sınır uygulanmaz', async () => {
    const deps = buildDeps('SHADOW');
    deps.prisma.message.count.mockResolvedValueOnce(999);
    deps.openai.chat.mockResolvedValueOnce({
      content: 'Taslak',
      toolCalls: [],
    });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.openai.chat).toHaveBeenCalled();
    expect(deps.handoffService.handoff).not.toHaveBeenCalled();
  });

  it('cevaplanamayan soru gölge modda da kaydedilir', async () => {
    const deps = buildDeps('SHADOW');
    deps.knowledge.search.mockResolvedValueOnce({ items: [], topScore: 0.1 });
    deps.openai.chat.mockResolvedValueOnce({
      content: 'Taslak',
      toolCalls: [],
    });

    await deps.service.handleIncoming('conv-1', 'Bilinmeyen soru');

    expect(deps.knowledge.recordUnanswered).toHaveBeenCalledWith(
      'conv-1',
      expect.any(String),
      0.1,
    );
  });

  it('medya turunda sabit cevabı taslak yazar ve ikinci medyada da devretmez', async () => {
    const deps = buildDeps('SHADOW');
    deps.prisma.message.findFirst.mockResolvedValueOnce({ id: 'msg-1' });

    await deps.service.handleIncoming('conv-1', MEDIA, { kind: 'unsupported' });

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.handoffService.handoff).not.toHaveBeenCalled();
    expect(deps.prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: MEDIA_REPLY,
        isDraft: true,
        draftMeta: { mode: 'SHADOW', tools: [] },
      }),
    });
  });

  it('kriz: taslak yazar, e-posta ve personel bildirimi çalışır', async () => {
    const deps = buildDeps('SHADOW');

    await deps.service.handleCrisis('conv-1');

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: CRISIS_MESSAGE,
        isDraft: true,
      }),
    });
    expect(deps.crisisAlert.alert).toHaveBeenCalledWith('conv-1', 'detected');
    expect(deps.notifications.notifyAdmins).toHaveBeenCalledWith(
      'DANGER_PANIC',
      expect.any(String),
    );
  });
});

describe('taslak (draftOnly) ve mod kuralları', () => {
  it('draftOnly turu LIVE modda bile taslak olur ve STANDBY işaretlenir', async () => {
    const deps = buildDeps('LIVE');
    deps.openai.chat.mockResolvedValueOnce({
      content: 'Taslak',
      toolCalls: [],
    });

    await deps.service.handleIncoming('conv-1', 'Merhaba', { draftOnly: true });

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isDraft: true,
        draftMeta: { mode: 'STANDBY', tools: [] },
      }),
    });
    expect(deps.handoffService.handoff).not.toHaveBeenCalled();
  });

  it('OFF modunda handleCrisis mesaj yazmaz ama e-posta gönderir', async () => {
    const deps = buildDeps('OFF');

    await deps.service.handleCrisis('conv-1', { repeat: true });

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.message.create).not.toHaveBeenCalled();
    expect(deps.crisisAlert.alert).toHaveBeenCalledWith('conv-1', 'repeat');
  });

  it('taslaklar konuşma geçmişine ve son cevap sorgusuna girmez', async () => {
    const deps = buildDeps('LIVE');
    deps.openai.chat.mockResolvedValueOnce({ content: 'ok', toolCalls: [] });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversationId: 'conv-1',
          isDraft: false,
        }),
      }),
    );
    expect(deps.prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      }),
    );
    expect(deps.prisma.message.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      }),
    );
  });

  it('tekrar eden kriz repeat türüyle e-posta tetikler ve mesaj göndermez', async () => {
    const deps = buildDeps('LIVE');

    await deps.service.handleCrisis('conv-1', { repeat: true });

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.crisisAlert.alert).toHaveBeenCalledWith('conv-1', 'repeat');
  });
});

describe('bekleme süresi ve taslak', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('bekleme penceresinde bir mesaj taslak ise tur taslak olur', async () => {
    const deps = buildDeps('LIVE', { ASSISTANT_DEBOUNCE_MS: '5000' });
    deps.openai.chat.mockResolvedValue({ content: 'ok', toolCalls: [] });

    void deps.service.handleIncoming('conv-1', 'randevu', { draftOnly: true });
    jest.advanceTimersByTime(1000);
    void deps.service.handleIncoming('conv-1', 'saat kaçta');
    jest.advanceTimersByTime(5000);
    await flushPromises();

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isDraft: true,
        draftMeta: { mode: 'STANDBY', tools: [] },
      }),
    });
  });
});

describe('kişi tipi (uzman / iç ekip)', () => {
  it.each(['UZMAN', 'EKIP'])(
    '%s kişiye cevap vermez ve uzman_ekip ile devreder',
    async (contactType) => {
      const deps = buildDeps('LIVE');
      deps.prisma.conversation.findUnique.mockResolvedValue({
        ...CONVERSATION,
        contact: { ...CONVERSATION.contact, contactType },
      });

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.openai.chat).not.toHaveBeenCalled();
      expect(deps.metaSender.sendText).not.toHaveBeenCalled();
      expect(deps.handoffService.handoff).toHaveBeenCalledWith(
        'conv-1',
        'uzman_ekip',
        'Uzman veya iç ekip mesajı — Elif cevap vermez',
      );
    },
  );

  it('gölge modda uzman kişide devir yapmaz', async () => {
    const deps = buildDeps('SHADOW');
    deps.prisma.conversation.findUnique.mockResolvedValue({
      ...CONVERSATION,
      contact: { ...CONVERSATION.contact, contactType: 'UZMAN' },
    });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.openai.chat).not.toHaveBeenCalled();
    expect(deps.handoffService.handoff).not.toHaveBeenCalled();
  });

  it('uzman kişiye kriz mesajı gönderilmez ama e-posta gider', async () => {
    const deps = buildDeps('LIVE');
    deps.prisma.conversation.findUnique.mockResolvedValue({
      ...CONVERSATION,
      contact: { ...CONVERSATION.contact, contactType: 'UZMAN' },
    });

    await deps.service.handleCrisis('conv-1');

    expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    expect(deps.crisisAlert.alert).toHaveBeenCalledWith('conv-1', 'detected');
  });
});

describe('aydınlatma metni', () => {
  const NOTICE = 'Bu sohbet yapay zekâ destekli asistan tarafından yanıtlanır.';

  const withNotice = (deps: ReturnType<typeof buildDeps>) =>
    deps.settingsService.getSettings.mockResolvedValue({
      mode: 'LIVE',
      envEnabled: true,
      effectiveMode: 'LIVE',
      noticeText: NOTICE,
    });

  it('LIVE modda ilk gerçek cevaptan önce bir kez gönderilir', async () => {
    const deps = buildDeps('LIVE');
    withNotice(deps);
    deps.openai.chat.mockResolvedValueOnce({ content: 'Cevap', toolCalls: [] });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.metaSender.sendText.mock.calls.map((c) => c[2])).toEqual([
      NOTICE,
      'Cevap',
    ]);
    expect(deps.prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { noticeSentAt: expect.any(Date) },
    });
  });

  it('noticeSentAt doluysa tekrar gönderilmez', async () => {
    const deps = buildDeps('LIVE');
    withNotice(deps);
    deps.prisma.conversation.findUnique.mockResolvedValue({
      ...CONVERSATION,
      contact: { ...CONVERSATION.contact, noticeSentAt: new Date() },
    });
    deps.openai.chat.mockResolvedValueOnce({ content: 'Cevap', toolCalls: [] });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.metaSender.sendText.mock.calls.map((c) => c[2])).toEqual([
      'Cevap',
    ]);
    expect(deps.prisma.contact.update).not.toHaveBeenCalled();
  });

  it('aydınlatma gönderilemezse cevap yine gider ve kayıt işaretlenmez', async () => {
    const deps = buildDeps('LIVE');
    withNotice(deps);
    deps.metaSender.sendText.mockResolvedValueOnce({ ok: false });
    deps.openai.chat.mockResolvedValueOnce({ content: 'Cevap', toolCalls: [] });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.metaSender.sendText.mock.calls.map((c) => c[2])).toEqual([
      NOTICE,
      'Cevap',
    ]);
    expect(deps.prisma.contact.update).not.toHaveBeenCalled();
  });

  it('metin boşsa aydınlatma gönderilmez', async () => {
    const deps = buildDeps('LIVE');
    deps.openai.chat.mockResolvedValueOnce({ content: 'Cevap', toolCalls: [] });

    await deps.service.handleIncoming('conv-1', 'Merhaba');

    expect(deps.metaSender.sendText.mock.calls.map((c) => c[2])).toEqual([
      'Cevap',
    ]);
  });

  it('kriz mesajından önce aydınlatma gönderilmez', async () => {
    const deps = buildDeps('LIVE');
    withNotice(deps);

    await deps.service.handleCrisis('conv-1');

    expect(deps.metaSender.sendText.mock.calls.map((c) => c[2])).toEqual([
      CRISIS_MESSAGE,
    ]);
    expect(deps.prisma.contact.update).not.toHaveBeenCalled();
  });
});
