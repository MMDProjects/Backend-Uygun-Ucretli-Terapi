import { ConfigService } from '@nestjs/config';
import { AssistantService } from './assistant.service';
import { OpenAiUnavailableError } from './openai.client';
import { CRISIS_MESSAGE } from './crisis-message';
import { PrismaService } from '../prisma/prisma.service';

const CONVERSATION = {
  id: 'conv-1',
  channel: 'WHATSAPP',
  isBotActive: true,
  flaggedCrisis: false,
  contact: { id: 'contact-1', phone: '905550001122', instagramId: null },
};

function buildPrismaMock() {
  return {
    conversation: {
      findUnique: jest.fn<any, any>().mockResolvedValue(CONVERSATION),
      update: jest.fn<any, any>().mockResolvedValue({}),
    },
    message: {
      findMany: jest
        .fn<any, any>()
        .mockResolvedValue([
          { senderType: 'CLIENT', content: 'Merhaba, randevu almak istiyorum' },
        ]),
      create: jest.fn<any, any>().mockResolvedValue({}),
    },
  };
}

function buildDeps(enabled: boolean) {
  const prisma = buildPrismaMock();
  const config = {
    get: jest.fn((key: string, def?: string) => {
      if (key === 'ASSISTANT_ENABLED') return enabled ? 'true' : 'false';
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
  const metaSender = { sendText: jest.fn<any, any>().mockResolvedValue(true) };
  const notifications = {
    notifyAdmins: jest.fn<any, any>().mockResolvedValue(undefined),
  };
  const inboxEvents = { emit: jest.fn<any, any>() };

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
  };
}

describe('AssistantService', () => {
  describe('ASSISTANT_ENABLED kilidi kapalıyken', () => {
    it('handleIncoming hiçbir şey çağırmaz', async () => {
      const deps = buildDeps(false);

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.prisma.conversation.findUnique).not.toHaveBeenCalled();
      expect(deps.knowledge.search).not.toHaveBeenCalled();
      expect(deps.openai.chat).not.toHaveBeenCalled();
      expect(deps.metaSender.sendText).not.toHaveBeenCalled();
      expect(deps.handoffService.handoff).not.toHaveBeenCalled();
    });

    it('handleCrisis danışana mesaj göndermez ama personeli bilgilendirir', async () => {
      const deps = buildDeps(false);

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
      const deps = buildDeps(true);
      deps.prisma.conversation.findUnique.mockResolvedValueOnce({
        ...CONVERSATION,
        isBotActive: false,
      });

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.openai.chat).not.toHaveBeenCalled();
      expect(deps.metaSender.sendText).not.toHaveBeenCalled();
    });

    it('bilgi bankasında eşleşme yoksa soruyu bilinmeyenlere kaydeder', async () => {
      const deps = buildDeps(true);
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
      const deps = buildDeps(true);
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
        },
      });
    });

    it('personel_aktar_tool devir yapar', async () => {
      const deps = buildDeps(true);
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
      const deps = buildDeps(true);
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
      const deps = buildDeps(true);
      deps.openai.chat.mockResolvedValueOnce({
        content: 'Cevap',
        toolCalls: [],
      });
      deps.metaSender.sendText.mockResolvedValueOnce(false);

      await deps.service.handleIncoming('conv-1', 'Merhaba');

      expect(deps.handoffService.handoff).toHaveBeenCalledWith(
        'conv-1',
        'bilinmeyen_konu',
        'Asistan yanıtı danışana gönderilemedi',
      );
      expect(deps.prisma.message.create).not.toHaveBeenCalled();
    });

    it('LLM çalışırken personel devraldıysa bot yanıtını göndermez', async () => {
      const deps = buildDeps(true);
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
      const deps = buildDeps(true);
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
      const deps = buildDeps(true);
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
      const deps = buildDeps(true);

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
