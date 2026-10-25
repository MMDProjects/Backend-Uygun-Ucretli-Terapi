import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LeadStatus,
  Prisma,
  SenderType,
  UnansweredStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

const ISTANBUL_TZ = 'Europe/Istanbul';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;
const TOP_QUESTIONS = 10;
const NO_REASON = 'belirtilmedi';
const DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: ISTANBUL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Konuşma içindeki ilk zamanlar. Mesajlar zaman sırasıyla gelir.
interface ConversationTimes {
  client?: Date;
  bot?: Date;
  agent?: Date;
  hasAgent: boolean;
  hasSentBot: boolean;
}

interface DayRange {
  startDay: string;
  endDay: string;
  days: number;
  rangeStart: Date;
  rangeEnd: Date;
}

export interface DailyRow {
  date: string;
  conversations: number;
  handoffs: number;
  leads: number;
}

// İstanbul takvim gününün anahtarı (YYYY-MM-DD).
export function istanbulDayKey(date: Date): string {
  const parts = DAY_FORMAT.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

// Europe/Istanbul yaz saati uygulamaz; sabit UTC+3.
function istanbulMidnight(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+03:00`);
}

function addDays(dayKey: string, amount: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(startDay: string, endDay: string): number {
  const span =
    Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`);
  return Math.round(span / DAY_MS) + 1;
}

function resolveRange(query: AnalyticsQueryDto): DayRange {
  const endDay = query.to
    ? istanbulDayKey(new Date(query.to))
    : istanbulDayKey(new Date());
  const startDay = query.from
    ? istanbulDayKey(new Date(query.from))
    : addDays(endDay, -(DEFAULT_DAYS - 1));
  if (startDay > endDay) {
    throw new BadRequestException(
      'Başlangıç tarihi bitiş tarihinden sonra olamaz.',
    );
  }
  const days = inclusiveDays(startDay, endDay);
  if (days > MAX_DAYS) {
    throw new BadRequestException(
      `En fazla ${MAX_DAYS} günlük aralık seçilebilir.`,
    );
  }
  return {
    startDay,
    endDay,
    days,
    rangeStart: istanbulMidnight(startDay),
    rangeEnd: istanbulMidnight(addDays(endDay, 1)),
  };
}

// Oran; paydası 0 ise null (veri yok).
function ratio(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 10000) / 10000;
}

// Ortanca (saniye). Veri yoksa null.
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value);
}

function hasRetrievalHit(retrieval: Prisma.JsonValue): boolean {
  if (!retrieval || typeof retrieval !== 'object' || Array.isArray(retrieval)) {
    return false;
  }
  const items = (retrieval as { items?: unknown }).items;
  return Array.isArray(items) && items.length > 0;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(query: AnalyticsQueryDto) {
    const range = resolveRange(query);
    const createdIn = { gte: range.rangeStart, lt: range.rangeEnd };

    const [
      conversations,
      handoffRows,
      leads,
      appointments,
      unansweredTotal,
      topQuestions,
      messages,
      retrievalRows,
    ] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { createdAt: createdIn },
        select: {
          id: true,
          createdAt: true,
          handedOffAt: true,
          flaggedCrisis: true,
        },
      }),
      this.prisma.conversation.findMany({
        where: { handedOffAt: createdIn },
        select: { handedOffAt: true, handoffReason: true },
      }),
      this.prisma.lead.findMany({
        where: { createdAt: createdIn },
        select: { createdAt: true, status: true },
      }),
      this.prisma.appointment.count({ where: { createdAt: createdIn } }),
      this.prisma.unansweredQuestion.count({
        where: { createdAt: createdIn },
      }),
      this.prisma.unansweredQuestion.findMany({
        where: { createdAt: createdIn, status: UnansweredStatus.OPEN },
        orderBy: { askCount: 'desc' },
        take: TOP_QUESTIONS,
        select: { question: true, askCount: true },
      }),
      this.prisma.message.findMany({
        where: {
          isDraft: false,
          senderType: {
            in: [SenderType.CLIENT, SenderType.BOT, SenderType.AGENT],
          },
          conversation: { createdAt: createdIn },
        },
        orderBy: { createdAt: 'asc' },
        select: { conversationId: true, senderType: true, createdAt: true },
      }),
      this.prisma.message.findMany({
        where: {
          senderType: SenderType.BOT,
          retrieval: { not: Prisma.DbNull },
          createdAt: createdIn,
        },
        select: { retrieval: true },
      }),
    ]);

    const times = this.collectTimes(messages);
    const botOnly = conversations.filter((conversation) => {
      const state = times.get(conversation.id);
      return (
        conversation.handedOffAt === null &&
        state !== undefined &&
        !state.hasAgent &&
        state.hasSentBot
      );
    }).length;

    const botDurations: number[] = [];
    const agentDurations: number[] = [];
    for (const state of times.values()) {
      if (!state.client) continue;
      if (state.bot) {
        botDurations.push(
          (state.bot.getTime() - state.client.getTime()) / 1000,
        );
      }
      if (state.agent) {
        agentDurations.push(
          (state.agent.getTime() - state.client.getTime()) / 1000,
        );
      }
    }

    const kbHits = retrievalRows.filter((row) =>
      hasRetrievalHit(row.retrieval),
    ).length;
    const leadsByStatus = Object.values(LeadStatus).map((status) => ({
      status,
      count: leads.filter((lead) => lead.status === status).length,
    }));
    const booked =
      leadsByStatus.find(
        (item) => item.status === LeadStatus.RANDEVU_OLUSTURULDU,
      )?.count ?? 0;

    return {
      from: range.startDay,
      to: range.endDay,
      days: range.days,
      timezone: ISTANBUL_TZ,
      conversations: conversations.length,
      botOnly,
      botOnlyRate: ratio(botOnly, conversations.length),
      handoffs: {
        total: handoffRows.length,
        byReason: this.countBy(
          handoffRows.map((row) => row.handoffReason ?? NO_REASON),
        ),
      },
      leads: {
        total: leads.length,
        byStatus: leadsByStatus,
        bookedRate: ratio(booked, leads.length),
      },
      appointments,
      unanswered: {
        total: unansweredTotal,
        topQuestions,
      },
      kbHitRate: ratio(kbHits, retrievalRows.length),
      firstResponse: {
        botMedianSeconds: median(botDurations),
        agentMedianSeconds: median(agentDurations),
      },
      daily: this.buildDaily(range, conversations, handoffRows, leads),
      crisis: conversations.filter((c) => c.flaggedCrisis).length,
    };
  }

  // Konuşma başına ilk danışan mesajından sonraki ilk bot ve personel mesajı.
  private collectTimes(
    messages: {
      conversationId: string;
      senderType: SenderType;
      createdAt: Date;
    }[],
  ): Map<string, ConversationTimes> {
    const map = new Map<string, ConversationTimes>();
    for (const message of messages) {
      let state = map.get(message.conversationId);
      if (!state) {
        state = { hasAgent: false, hasSentBot: false };
        map.set(message.conversationId, state);
      }
      if (message.senderType === SenderType.CLIENT) {
        state.client ??= message.createdAt;
      } else if (message.senderType === SenderType.BOT) {
        state.hasSentBot = true;
        if (state.client) state.bot ??= message.createdAt;
      } else {
        state.hasAgent = true;
        if (state.client) state.agent ??= message.createdAt;
      }
    }
    return map;
  }

  private countBy(values: string[]): { reason: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Aralıktaki her İstanbul günü için sayılar; boş günler 0.
  private buildDaily(
    range: DayRange,
    conversations: { createdAt: Date }[],
    handoffs: { handedOffAt: Date | null }[],
    leads: { createdAt: Date }[],
  ): DailyRow[] {
    const days = new Map<string, DailyRow>();
    for (let i = 0; i < range.days; i++) {
      const date = addDays(range.startDay, i);
      days.set(date, { date, conversations: 0, handoffs: 0, leads: 0 });
    }
    for (const row of conversations) {
      const day = days.get(istanbulDayKey(row.createdAt));
      if (day) day.conversations += 1;
    }
    for (const row of handoffs) {
      if (!row.handedOffAt) continue;
      const day = days.get(istanbulDayKey(row.handedOffAt));
      if (day) day.handoffs += 1;
    }
    for (const row of leads) {
      const day = days.get(istanbulDayKey(row.createdAt));
      if (day) day.leads += 1;
    }
    return [...days.values()];
  }
}
