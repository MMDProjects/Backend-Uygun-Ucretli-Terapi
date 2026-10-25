import { BadRequestException } from '@nestjs/common';
import { LeadStatus, SenderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

// Sahte veri: İstanbul saatiyle 1-3 Ekim 2026.
const conversations = [
  // Yalnız bot: bot 10 sn sonra cevap verdi.
  {
    id: 'c1',
    createdAt: new Date('2026-10-01T10:00:00+03:00'),
    handedOffAt: null,
    flaggedCrisis: false,
  },
  // Devredilmiş; ilk bot 20 sn, personel 300 sn sonra.
  {
    id: 'c2',
    createdAt: new Date('2026-10-02T10:00:00+03:00'),
    handedOffAt: new Date('2026-10-02T11:00:00+03:00'),
    flaggedCrisis: false,
  },
  // Personel mesajı var (bot yok); kriz işaretli.
  {
    id: 'c3',
    createdAt: new Date('2026-10-02T12:00:00+03:00'),
    handedOffAt: null,
    flaggedCrisis: true,
  },
  // Mesajı yok.
  {
    id: 'c4',
    createdAt: new Date('2026-10-03T09:00:00+03:00'),
    handedOffAt: null,
    flaggedCrisis: false,
  },
];

const messages = [
  {
    conversationId: 'c1',
    senderType: SenderType.CLIENT,
    createdAt: new Date('2026-10-01T10:00:00+03:00'),
  },
  {
    conversationId: 'c1',
    senderType: SenderType.BOT,
    createdAt: new Date('2026-10-01T10:00:10+03:00'),
  },
  {
    conversationId: 'c2',
    senderType: SenderType.CLIENT,
    createdAt: new Date('2026-10-02T10:00:00+03:00'),
  },
  {
    conversationId: 'c2',
    senderType: SenderType.BOT,
    createdAt: new Date('2026-10-02T10:00:20+03:00'),
  },
  {
    conversationId: 'c2',
    senderType: SenderType.AGENT,
    createdAt: new Date('2026-10-02T10:05:00+03:00'),
  },
  {
    conversationId: 'c3',
    senderType: SenderType.CLIENT,
    createdAt: new Date('2026-10-02T12:00:00+03:00'),
  },
  {
    conversationId: 'c3',
    senderType: SenderType.AGENT,
    createdAt: new Date('2026-10-02T12:00:40+03:00'),
  },
];

const handoffRows = [
  {
    handedOffAt: new Date('2026-10-02T11:00:00+03:00'),
    handoffReason: 'uzman_ekip',
  },
  { handedOffAt: new Date('2026-10-03T11:00:00+03:00'), handoffReason: null },
];

const leads = [
  {
    createdAt: new Date('2026-10-01T12:00:00+03:00'),
    status: LeadStatus.RANDEVU_OLUSTURULDU,
  },
  { createdAt: new Date('2026-10-02T12:00:00+03:00'), status: LeadStatus.YENI },
];

const retrievalRows = [
  { retrieval: { items: [{ id: 'kb-1' }] } },
  { retrieval: { items: [] } },
  { retrieval: { items: [] } },
];

function buildPrismaMock() {
  return {
    conversation: {
      findMany: jest.fn<any, any>(({ where }: any) =>
        where.handedOffAt ? handoffRows : conversations,
      ),
    },
    lead: { findMany: jest.fn<any, any>().mockResolvedValue(leads) },
    appointment: { count: jest.fn<any, any>().mockResolvedValue(3) },
    unansweredQuestion: {
      count: jest.fn<any, any>().mockResolvedValue(5),
      findMany: jest
        .fn<any, any>()
        .mockResolvedValue([{ question: 'Fiyat?', askCount: 4 }]),
    },
    message: {
      findMany: jest.fn<any, any>(({ where }: any) =>
        where.retrieval ? retrievalRows : messages,
      ),
    },
  };
}

describe('AnalyticsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: AnalyticsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new AnalyticsService(prisma as unknown as PrismaService);
  });

  it('dönemdeki konuşma, yalnız bot ve devir sayılarını hesaplar', async () => {
    const result = await service.getAnalytics({
      from: '2026-10-01',
      to: '2026-10-03',
    });

    expect(result.from).toBe('2026-10-01');
    expect(result.to).toBe('2026-10-03');
    expect(result.days).toBe(3);
    expect(result.conversations).toBe(4);
    expect(result.botOnly).toBe(1);
    expect(result.botOnlyRate).toBe(0.25);
    expect(result.handoffs.total).toBe(2);
    expect(result.handoffs.byReason).toEqual(
      expect.arrayContaining([
        { reason: 'uzman_ekip', count: 1 },
        { reason: 'belirtilmedi', count: 1 },
      ]),
    );
    expect(result.crisis).toBe(1);
  });

  it('arama talebi, randevu, soru ve kb oranlarını hesaplar', async () => {
    const result = await service.getAnalytics({
      from: '2026-10-01',
      to: '2026-10-03',
    });

    expect(result.leads.total).toBe(2);
    expect(result.leads.byStatus).toEqual(
      expect.arrayContaining([
        { status: LeadStatus.YENI, count: 1 },
        { status: LeadStatus.ARANDI, count: 0 },
        { status: LeadStatus.RANDEVU_OLUSTURULDU, count: 1 },
      ]),
    );
    expect(result.leads.bookedRate).toBe(0.5);
    expect(result.appointments).toBe(3);
    expect(result.unanswered).toEqual({
      total: 5,
      topQuestions: [{ question: 'Fiyat?', askCount: 4 }],
    });
    expect(result.kbHitRate).toBeCloseTo(1 / 3, 4);
  });

  it('ilk yanıt medyanlarını saniye olarak hesaplar', async () => {
    const result = await service.getAnalytics({
      from: '2026-10-01',
      to: '2026-10-03',
    });

    // Bot: 10 ve 20 sn → ortanca 15. Personel: 300 ve 40 sn → ortanca 170.
    expect(result.firstResponse).toEqual({
      botMedianSeconds: 15,
      agentMedianSeconds: 170,
    });
  });

  it('daily aralıktaki her gün için satır üretir ve boş günleri 0 yazar', async () => {
    const result = await service.getAnalytics({
      from: '2026-10-01',
      to: '2026-10-03',
    });

    expect(result.daily).toEqual([
      { date: '2026-10-01', conversations: 1, handoffs: 0, leads: 1 },
      { date: '2026-10-02', conversations: 2, handoffs: 1, leads: 1 },
      { date: '2026-10-03', conversations: 1, handoffs: 1, leads: 0 },
    ]);
  });

  it('tarih verilmezse son 30 günü kullanır', async () => {
    const result = await service.getAnalytics({});

    expect(result.days).toBe(30);
    expect(result.daily).toHaveLength(30);
  });

  it('180 gün sınırında izin verir, aşınca 400 döner', async () => {
    await expect(
      service.getAnalytics({ from: '2026-01-01', to: '2026-06-29' }),
    ).resolves.toMatchObject({ days: 180 });

    await expect(
      service.getAnalytics({ from: '2026-01-01', to: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('başlangıç bitişten sonra ise 400 döner', async () => {
    await expect(
      service.getAnalytics({ from: '2026-10-05', to: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('veri yoksa oranlar null, medyanlar null döner', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);

    const result = await service.getAnalytics({
      from: '2026-10-01',
      to: '2026-10-01',
    });

    expect(result.botOnlyRate).toBeNull();
    expect(result.leads.bookedRate).toBeNull();
    expect(result.kbHitRate).toBeNull();
    expect(result.firstResponse).toEqual({
      botMedianSeconds: null,
      agentMedianSeconds: null,
    });
  });
});
