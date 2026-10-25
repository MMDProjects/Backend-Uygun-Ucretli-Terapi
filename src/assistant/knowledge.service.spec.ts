import { KnowledgeSource, UnansweredStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  KnowledgeService,
  cosineSimilarity,
  isSmallTalk,
} from './knowledge.service';
import { OpenAiClient, OpenAiUnavailableError } from './openai.client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

function buildPrismaMock() {
  return {
    knowledgeBase: {
      findMany: jest.fn<any, any>(),
      findFirst: jest.fn<any, any>(),
      create: jest.fn<any, any>(),
      findUnique: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
      delete: jest.fn<any, any>(),
      deleteMany: jest.fn<any, any>(),
      updateMany: jest.fn<any, any>(),
      count: jest.fn<any, any>(),
    },
    sss: {
      findUnique: jest.fn<any, any>(),
      findMany: jest.fn<any, any>(),
    },
    unansweredQuestion: {
      create: jest.fn<any, any>(),
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      update: jest.fn<any, any>(),
    },
  };
}

function buildOpenAiMock() {
  return {
    embed: jest.fn<any, any>(),
    chat: jest.fn<any, any>(),
  };
}

function buildConfig(threshold?: string) {
  return {
    get: jest.fn((key: string, def?: string) =>
      key === 'ASSISTANT_SIMILARITY_THRESHOLD' && threshold !== undefined
        ? threshold
        : def,
    ),
  } as unknown as ConfigService;
}

describe('cosineSimilarity', () => {
  it('aynı vektör için 1 döndürür', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('dik vektörler için 0 döndürür', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('sıfır vektörde 0 döndürür', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('KnowledgeService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let openai: ReturnType<typeof buildOpenAiMock>;
  let inboxEvents: { emit: jest.Mock };

  function build(threshold?: string) {
    return new KnowledgeService(
      prisma as unknown as PrismaService,
      openai as unknown as OpenAiClient,
      buildConfig(threshold),
      inboxEvents as unknown as InboxEventsService,
    );
  }

  beforeEach(() => {
    prisma = buildPrismaMock();
    openai = buildOpenAiMock();
    inboxEvents = { emit: jest.fn<any, any>() };
  });

  describe('search', () => {
    it('eşik altındaki kayıtları eler ve skora göre sıralar', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findMany.mockResolvedValue([
        { id: 'low', title: 'düşük', content: 'c1', embedding: [0.1, 1] },
        { id: 'high', title: 'yüksek', content: 'c2', embedding: [1, 0] },
        { id: 'mid', title: 'orta', content: 'c3', embedding: [1, 1] },
      ]);

      const result = await build('0.5').search('soru');

      expect(result.items.map((i) => i.id)).toEqual(['high', 'mid']);
      expect(result.items[0].score).toBeCloseTo(1);
      expect(result.items[1].score).toBeCloseTo(Math.SQRT1_2);
      expect(result.topScore).toBeCloseTo(1);
    });

    it('varsayılan eşik 0.40 kullanır', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findMany.mockResolvedValue([
        { id: 'a', title: 'a', content: 'a', embedding: [0.39, 0.92] },
        { id: 'b', title: 'b', content: 'b', embedding: [0.41, 0.91] },
      ]);

      const result = await build().search('soru');

      expect(result.items.map((i) => i.id)).toEqual(['b']);
    });

    it('en fazla 4 sonuç döndürür', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findMany.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => ({
          id: `k${i}`,
          title: `t${i}`,
          content: `c${i}`,
          embedding: [1, 0.01 * i],
        })),
      );

      const result = await build('0.1').search('soru');

      expect(result.items).toHaveLength(4);
      expect(result.items[0].id).toBe('k0');
    });

    it('eşik üstü kayıt yoksa items boş, topScore en yüksek skor olur', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findMany.mockResolvedValue([
        { id: 'a', title: 'a', content: 'a', embedding: [0, 1] },
      ]);

      const result = await build('0.4').search('soru');

      expect(result).toEqual({ items: [], topScore: 0, threshold: 0.4 });
    });

    it('bilgi bankası boşsa items boş ve topScore null döner', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findMany.mockResolvedValue([]);

      const result = await build().search('soru');

      expect(result).toEqual({ items: [], topScore: null, threshold: 0.4 });
    });

    it('her öğede id, title, source ve score bulunur', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findMany.mockResolvedValue([
        {
          id: 'a',
          title: 'Başlık',
          content: 'İçerik',
          source: 'MANUAL',
          embedding: [1, 0],
        },
      ]);

      const result = await build('0.4').search('soru');

      expect(result.items).toEqual([
        {
          id: 'a',
          title: 'Başlık',
          content: 'İçerik',
          source: 'MANUAL',
          score: expect.any(Number),
        },
      ]);
    });

    it('yalnızca aktif kayıtları sorgular', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findMany.mockResolvedValue([]);

      await build().search('soru');

      expect(prisma.knowledgeBase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('OpenAI yoksa boş sonuç döner ve veritabanına gitmez', async () => {
      openai.embed.mockRejectedValue(new OpenAiUnavailableError());

      const result = await build().search('soru');

      expect(result).toEqual({ items: [], topScore: null, threshold: 0.4 });
      expect(prisma.knowledgeBase.findMany).not.toHaveBeenCalled();
    });
  });

  describe('embedMany', () => {
    it('metinleri 50 gruplu OpenAI çağrısına böler ve sırayı korur', async () => {
      openai.embed.mockImplementation((batch: string[]) =>
        Promise.resolve(batch.map((t) => [Number(t)])),
      );
      const texts = Array.from({ length: 120 }, (_, i) => String(i));

      const vectors = await build().embedMany(texts);

      expect(openai.embed).toHaveBeenCalledTimes(3);
      expect(openai.embed.mock.calls[0][0]).toHaveLength(50);
      expect(openai.embed.mock.calls[2][0]).toHaveLength(20);
      expect(vectors).toHaveLength(120);
      expect(vectors[119]).toEqual([119]);
    });

    it('boş dizide OpenAI çağrısı yapmaz', async () => {
      expect(await build().embedMany([])).toEqual([]);
      expect(openai.embed).not.toHaveBeenCalled();
    });
  });

  describe('reindexMissing', () => {
    it('embedding boş kayıtları toplu indeksler ve sayıları döner', async () => {
      prisma.knowledgeBase.findMany.mockResolvedValue([
        {
          id: 'm1',
          title: 'Başlık',
          content: 'İçerik',
          source: 'MANUAL',
        },
        {
          id: 's1',
          title: 'Soru',
          content: 'Soru: Soru\nCevap: Cevap',
          source: 'SSS',
        },
      ]);
      openai.embed.mockResolvedValue([[0.1], [0.2]]);
      prisma.knowledgeBase.count.mockResolvedValue(0);

      const result = await build().reindexMissing();

      expect(prisma.knowledgeBase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { embedding: { isEmpty: true } },
        }),
      );
      expect(openai.embed).toHaveBeenCalledWith([
        'Başlık\nİçerik',
        'Soru: Soru\nCevap: Cevap',
      ]);
      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { embedding: [0.1] },
      });
      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { embedding: [0.2] },
      });
      expect(result).toEqual({ processed: 2, failed: 0, remaining: 0 });
    });

    it('OpenAI yoksa OpenAiUnavailableError fırlatır', async () => {
      prisma.knowledgeBase.findMany.mockResolvedValue([
        { id: 'm1', title: 't', content: 'c', source: 'MANUAL' },
      ]);
      openai.embed.mockRejectedValue(new OpenAiUnavailableError());

      await expect(build().reindexMissing()).rejects.toBeInstanceOf(
        OpenAiUnavailableError,
      );
      expect(prisma.knowledgeBase.update).not.toHaveBeenCalled();
    });

    it('hata veren grubu failed sayar ve devam eder', async () => {
      prisma.knowledgeBase.findMany.mockResolvedValue([
        { id: 'm1', title: 't', content: 'c', source: 'MANUAL' },
      ]);
      openai.embed.mockRejectedValue(new Error('ağ hatası'));
      prisma.knowledgeBase.count.mockResolvedValue(1);

      const result = await build().reindexMissing();

      expect(result).toEqual({ processed: 0, failed: 1, remaining: 1 });
    });
  });

  describe('syncSss', () => {
    const activeSss = {
      id: 'sss-1',
      question: 'Seans ücreti ne kadar?',
      answer: 'Bireysel seans 2000 TL.',
      page: 'GENEL',
      isActive: true,
      order: 0,
    };

    it('aktif SSS için SSS kaynaklı KB kaydı oluşturur', async () => {
      prisma.sss.findUnique.mockResolvedValue(activeSss);
      openai.embed.mockResolvedValue([[0.5, 0.5]]);
      prisma.knowledgeBase.findFirst.mockResolvedValue(null);

      await build().syncSss('sss-1');

      expect(openai.embed).toHaveBeenCalledWith([
        'Soru: Seans ücreti ne kadar?\nCevap: Bireysel seans 2000 TL.',
      ]);
      expect(prisma.knowledgeBase.create).toHaveBeenCalledWith({
        data: {
          category: 'SSS',
          source: 'SSS',
          sourceRefId: 'sss-1',
          title: 'Seans ücreti ne kadar?',
          content:
            'Soru: Seans ücreti ne kadar?\nCevap: Bireysel seans 2000 TL.',
          embedding: [0.5, 0.5],
          isActive: true,
        },
      });
      expect(prisma.knowledgeBase.update).not.toHaveBeenCalled();
    });

    it('mevcut KB kaydı varsa günceller', async () => {
      prisma.sss.findUnique.mockResolvedValue(activeSss);
      openai.embed.mockResolvedValue([[0.5, 0.5]]);
      prisma.knowledgeBase.findFirst.mockResolvedValue({ id: 'kb-1' });

      await build().syncSss('sss-1');

      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'kb-1' } }),
      );
      expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
    });

    it('SSS pasifse KB kaydını siler ve embed etmez', async () => {
      prisma.sss.findUnique.mockResolvedValue({
        ...activeSss,
        isActive: false,
      });

      await build().syncSss('sss-1');

      expect(prisma.knowledgeBase.deleteMany).toHaveBeenCalledWith({
        where: { source: 'SSS', sourceRefId: 'sss-1' },
      });
      expect(openai.embed).not.toHaveBeenCalled();
    });

    it('SSS silinmişse KB kaydını siler', async () => {
      prisma.sss.findUnique.mockResolvedValue(null);

      await build().syncSss('sss-1');

      expect(prisma.knowledgeBase.deleteMany).toHaveBeenCalledWith({
        where: { source: 'SSS', sourceRefId: 'sss-1' },
      });
    });

    it('OpenAI yoksa hata fırlatmaz, yazmadan çıkar', async () => {
      prisma.sss.findUnique.mockResolvedValue(activeSss);
      openai.embed.mockRejectedValue(new OpenAiUnavailableError());

      await expect(build().syncSss('sss-1')).resolves.toBeUndefined();
      expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
      expect(prisma.knowledgeBase.update).not.toHaveBeenCalled();
    });
  });

  describe('reindexAllSss', () => {
    it('aktif SSS kayıtlarını indeksler, pasifleri atlar', async () => {
      prisma.sss.findMany.mockResolvedValue([
        { id: 'a', question: 'q1', answer: 'a1', isActive: true },
        { id: 'b', question: 'q2', answer: 'a2', isActive: false },
        { id: 'c', question: 'q3', answer: 'a3', isActive: true },
      ]);
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findFirst.mockResolvedValue(null);

      const result = await build().reindexAllSss();

      expect(result).toEqual({ indexed: 2, skipped: 1 });
      expect(prisma.knowledgeBase.create).toHaveBeenCalledTimes(2);
    });

    it('OpenAI yoksa tüm kayıtlar atlanır', async () => {
      prisma.sss.findMany.mockResolvedValue([
        { id: 'a', question: 'q1', answer: 'a1', isActive: true },
        { id: 'b', question: 'q2', answer: 'a2', isActive: true },
      ]);
      openai.embed.mockRejectedValue(new OpenAiUnavailableError());

      const result = await build().reindexAllSss();

      expect(result).toEqual({ indexed: 0, skipped: 2 });
      expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
    });
  });

  describe('isSmallTalk', () => {
    it.each([
      ['Merhaba', true],
      ['selam!', true],
      ['Teşekkürler 🙏', true],
      ['tamam.', true],
      ['İyi günler', true],
      ['görüşürüz', true],
      ['Teşekkür ederim', true],
      ['merhaba, bu fiyat ne kadar?', false],
      ['tamam peki seans ücreti kaç', false],
      ['', false],
      ['!!!', false],
    ])('%s → %s', (text, expected) => {
      expect(isSmallTalk(text)).toBe(expected);
    });
  });

  describe('recordUnanswered', () => {
    const question = 'Seans ücreti ne kadar acaba?';

    it('yeni soruyu embedding ile kaydeder', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.unansweredQuestion.findMany.mockResolvedValue([]);

      await build().recordUnanswered('conv-1', question, 0.31);

      expect(prisma.unansweredQuestion.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          question,
          topScore: 0.31,
          embedding: [1, 0],
        },
      });
      expect(prisma.unansweredQuestion.update).not.toHaveBeenCalled();
    });

    it('benzerlik 0.9 ise yeni kayıt açmaz, askCount artırır', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.unansweredQuestion.findMany.mockResolvedValue([
        { id: 'q-1', topScore: 0.2, embedding: [0.9, 0.436] },
      ]);

      await build().recordUnanswered('conv-1', question, 0.5);

      expect(prisma.unansweredQuestion.create).not.toHaveBeenCalled();
      expect(prisma.unansweredQuestion.update).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        data: expect.objectContaining({
          askCount: { increment: 1 },
          lastAskedAt: expect.any(Date),
          question,
          topScore: 0.5,
        }),
      });
    });

    it('benzerlik 0.5 ise yeni kayıt açar', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.unansweredQuestion.findMany.mockResolvedValue([
        { id: 'q-1', topScore: 0.2, embedding: [0.5, 0.866] },
      ]);

      await build().recordUnanswered('conv-1', question, 0.5);

      expect(prisma.unansweredQuestion.update).not.toHaveBeenCalled();
      expect(prisma.unansweredQuestion.create).toHaveBeenCalledTimes(1);
    });

    it('gruplama yalnızca OPEN sorulara bakar', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);

      await build().recordUnanswered('conv-1', question, 0.5);

      expect(prisma.unansweredQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: UnansweredStatus.OPEN },
        }),
      );
    });

    it('embedding alınamazsa gruplamadan yeni kayıt açar', async () => {
      openai.embed.mockRejectedValue(new OpenAiUnavailableError());

      await build().recordUnanswered('conv-1', question, 0.5);

      expect(prisma.unansweredQuestion.findMany).not.toHaveBeenCalled();
      expect(prisma.unansweredQuestion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ embedding: [] }),
      });
    });

    it.each([
      ['8 karakterden kısa metin', 'kısa', 0.5],
      ['selamlaşma', 'Teşekkürler 🙏', 0.5],
      ['onay ifadesi', 'İyi günler', 0.5],
      ['desteklenmeyen mesaj tipi', '[desteklenmeyen mesaj tipi: image]', 0.5],
      ['puanı hesaplanamayan arama', question, null],
    ])('%s kaydedilmez', async (_label, text, topScore) => {
      await build().recordUnanswered('conv-1', text, topScore);

      expect(openai.embed).not.toHaveBeenCalled();
      expect(prisma.unansweredQuestion.create).not.toHaveBeenCalled();
      expect(prisma.unansweredQuestion.update).not.toHaveBeenCalled();
      expect(inboxEvents.emit).not.toHaveBeenCalled();
    });

    it('kaydettikten sonra inbox’a counts.changed yayınlar', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);

      await build().recordUnanswered('conv-1', question, 0.5);

      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
    });
  });

  describe('UZMAN SSS sayfası', () => {
    it('syncSss UZMAN sayfasını bilgi bankasına aktarmaz, mevcut kaydı pasifleştirir', async () => {
      prisma.sss.findUnique.mockResolvedValue({
        id: 'sss-u',
        question: 'Uzman ücreti?',
        answer: 'Uzmanlara özel.',
        page: 'UZMAN',
        isActive: true,
        order: 0,
      });

      await build().syncSss('sss-u');

      expect(openai.embed).not.toHaveBeenCalled();
      expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
      expect(prisma.knowledgeBase.updateMany).toHaveBeenCalledWith({
        where: { source: KnowledgeSource.SSS, sourceRefId: 'sss-u' },
        data: { isActive: false },
      });
      expect(prisma.knowledgeBase.deleteMany).not.toHaveBeenCalled();
    });

    it('reindexAllSss UZMAN kayıtlarını atlar ve pasifleştirir', async () => {
      prisma.sss.findMany.mockResolvedValue([
        {
          id: 'g',
          question: 'q1',
          answer: 'a1',
          page: 'GENEL',
          isActive: true,
        },
        {
          id: 'u',
          question: 'q2',
          answer: 'a2',
          page: 'UZMAN',
          isActive: true,
        },
      ]);
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findFirst.mockResolvedValue(null);

      const result = await build().reindexAllSss();

      expect(result).toEqual({ indexed: 1, skipped: 1 });
      expect(openai.embed).toHaveBeenCalledWith(['Soru: q1\nCevap: a1']);
      expect(prisma.knowledgeBase.updateMany).toHaveBeenCalledWith({
        where: { source: KnowledgeSource.SSS, sourceRefId: 'u' },
        data: { isActive: false },
      });
    });
  });

  describe('createEntry', () => {
    it('MANUAL kaydı embedding ile oluşturur', async () => {
      openai.embed.mockResolvedValue([[0.1, 0.2]]);
      prisma.knowledgeBase.create.mockResolvedValue({ id: 'kb-new' });

      const result = await build().createEntry({
        category: 'HIZMET',
        title: 'Başlık',
        content: 'İçerik',
        source: 'MANUAL',
      });

      expect(openai.embed).toHaveBeenCalledWith(['Başlık\nİçerik']);
      expect(prisma.knowledgeBase.create).toHaveBeenCalledWith({
        data: {
          category: 'HIZMET',
          title: 'Başlık',
          content: 'İçerik',
          source: 'MANUAL',
          sourceRefId: null,
          embedding: [0.1, 0.2],
          isActive: true,
        },
      });
      expect(result).toEqual({ id: 'kb-new' });
    });

    it('OpenAI yoksa boş embedding ile yine oluşturur', async () => {
      openai.embed.mockRejectedValue(new OpenAiUnavailableError());
      prisma.knowledgeBase.create.mockResolvedValue({ id: 'kb-new' });

      await build().createEntry({
        category: 'PROSEDUR',
        title: 'T',
        content: 'C',
        source: 'MANUAL',
      });

      expect(prisma.knowledgeBase.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ embedding: [], isActive: true }),
      });
    });

    it('sourceRefId’li kayıtta aynı kaynağın mevcut kaydını günceller', async () => {
      openai.embed.mockResolvedValue([[1, 0]]);
      prisma.knowledgeBase.findFirst.mockResolvedValue({ id: 'kb-1' });
      prisma.knowledgeBase.update.mockResolvedValue({ id: 'kb-1' });

      await build().createEntry({
        category: 'SSS',
        title: 'T',
        content: 'C',
        source: 'CONVERSATION',
        sourceRefId: 'unanswered-1',
      });

      expect(prisma.knowledgeBase.findFirst).toHaveBeenCalledWith({
        where: { source: 'CONVERSATION', sourceRefId: 'unanswered-1' },
        select: { id: true },
      });
      expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith({
        where: { id: 'kb-1' },
        data: expect.objectContaining({ sourceRefId: 'unanswered-1' }),
      });
    });
  });

  describe('updateEntry', () => {
    const row = {
      id: 'kb-1',
      category: 'HIZMET',
      title: 'eski',
      content: 'c',
      source: 'MANUAL',
      sourceRefId: null,
      isActive: true,
    };

    it('başlık değişince yeniden embed eder', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(row);
      openai.embed.mockResolvedValue([[1, 1]]);
      prisma.knowledgeBase.update.mockResolvedValue({ ...row, title: 'yeni' });

      await build().updateEntry('kb-1', { title: 'yeni' });

      expect(openai.embed).toHaveBeenCalledWith(['yeni\nc']);
      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith({
        where: { id: 'kb-1' },
        data: { title: 'yeni', embedding: [1, 1] },
      });
    });

    it('yalnızca isActive değişirse embed çağrılmaz', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(row);
      prisma.knowledgeBase.update.mockResolvedValue({
        ...row,
        isActive: false,
      });

      await build().updateEntry('kb-1', { isActive: false });

      expect(openai.embed).not.toHaveBeenCalled();
      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith({
        where: { id: 'kb-1' },
        data: { isActive: false },
      });
    });

    it('OpenAI yoksa embedding boşalır, isActive korunur', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(row);
      openai.embed.mockRejectedValue(new OpenAiUnavailableError());
      prisma.knowledgeBase.update.mockResolvedValue(row);

      await build().updateEntry('kb-1', {
        content: 'yeni içerik',
        isActive: true,
      });

      expect(prisma.knowledgeBase.update).toHaveBeenCalledWith({
        where: { id: 'kb-1' },
        data: { content: 'yeni içerik', isActive: true, embedding: [] },
      });
    });

    it('SSS kaynaklı kayıtta 409 fırlatır', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({
        ...row,
        source: 'SSS',
      });

      await expect(build().updateEntry('kb-1', { title: 'x' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.knowledgeBase.update).not.toHaveBeenCalled();
    });

    it('kayıt yoksa 404 fırlatır', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(null);

      await expect(build().updateEntry('yok', { title: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteEntry', () => {
    it('MANUAL kaydı siler', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({
        id: 'kb-1',
        source: 'MANUAL',
      });

      await build().deleteEntry('kb-1');

      expect(prisma.knowledgeBase.delete).toHaveBeenCalledWith({
        where: { id: 'kb-1' },
      });
    });

    it('SSS kaynaklı kaydı silmez, 409 fırlatır', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({
        id: 'kb-2',
        source: 'SSS',
      });

      await expect(build().deleteEntry('kb-2')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.knowledgeBase.delete).not.toHaveBeenCalled();
    });
  });
});
