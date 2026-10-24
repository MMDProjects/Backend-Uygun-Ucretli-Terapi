import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KnowledgeBase,
  KnowledgeCategory,
  KnowledgeSource,
  Prisma,
  Sss,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { OpenAiClient, OpenAiUnavailableError } from './openai.client';

const MAX_RESULTS = 4;
const DEFAULT_THRESHOLD = 0.4;

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  score: number;
}

export interface KnowledgeSearchResult {
  items: KnowledgeItem[];
  topScore: number | null;
}

export interface ReindexResult {
  indexed: number;
  skipped: number;
}

export interface KnowledgeEntryInput {
  category: KnowledgeCategory;
  title: string;
  content: string;
  source: KnowledgeSource;
  sourceRefId?: string | null;
}

export interface KnowledgeEntryPatch {
  category?: KnowledgeCategory;
  title?: string;
  content?: string;
  isActive?: boolean;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);
  private readonly threshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiClient,
    config: ConfigService,
    private readonly inboxEvents: InboxEventsService,
  ) {
    const raw = Number(
      config.get<string>(
        'ASSISTANT_SIMILARITY_THRESHOLD',
        String(DEFAULT_THRESHOLD),
      ),
    );
    this.threshold = Number.isFinite(raw) ? raw : DEFAULT_THRESHOLD;
  }

  async search(query: string): Promise<KnowledgeSearchResult> {
    let queryVector: number[];
    try {
      [queryVector] = await this.openai.embed([query]);
    } catch (error) {
      if (error instanceof OpenAiUnavailableError) {
        return { items: [], topScore: null };
      }
      throw error;
    }

    const rows = await this.prisma.knowledgeBase.findMany({
      where: { isActive: true },
      select: { id: true, title: true, content: true, embedding: true },
    });

    const scored = rows
      .filter((row) => row.embedding.length > 0)
      .map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        score: cosineSimilarity(queryVector, row.embedding),
      }))
      .sort((a, b) => b.score - a.score);

    return {
      items: scored
        .filter((item) => item.score >= this.threshold)
        .slice(0, MAX_RESULTS),
      topScore: scored.length > 0 ? scored[0].score : null,
    };
  }

  async syncSss(sssId: string): Promise<void> {
    const sss = await this.prisma.sss.findUnique({ where: { id: sssId } });
    if (!sss || !sss.isActive) {
      await this.removeSss(sssId);
      return;
    }

    try {
      await this.upsertSss(sss);
    } catch (error) {
      if (error instanceof OpenAiUnavailableError) {
        this.logger.warn(
          `SSS bilgi bankasına eklenmedi (${sssId}): OpenAI yok`,
        );
        return;
      }
      throw error;
    }
  }

  async reindexAllSss(): Promise<ReindexResult> {
    const all = await this.prisma.sss.findMany();
    let indexed = 0;
    let skipped = 0;

    for (const sss of all) {
      if (!sss.isActive) {
        await this.removeSss(sss.id);
        skipped++;
        continue;
      }
      try {
        await this.upsertSss(sss);
        indexed++;
      } catch (error) {
        if (error instanceof OpenAiUnavailableError) {
          skipped++;
          continue;
        }
        throw error;
      }
    }

    return { indexed, skipped };
  }

  async recordUnanswered(
    conversationId: string,
    question: string,
    topScore: number | null,
  ): Promise<void> {
    await this.prisma.unansweredQuestion.create({
      data: { conversationId, question, topScore },
    });
    this.inboxEvents.emit('counts.changed', {});
  }

  async createEntry(input: KnowledgeEntryInput): Promise<KnowledgeBase> {
    const embedding = await this.embedOrEmpty(`${input.title}
${input.content}`);
    const data = {
      category: input.category,
      title: input.title,
      content: input.content,
      source: input.source,
      sourceRefId: input.sourceRefId ?? null,
      embedding,
      isActive: true,
    };

    if (input.sourceRefId) {
      return this.upsertBySource(input.source, input.sourceRefId, data);
    }
    return this.prisma.knowledgeBase.create({ data });
  }

  async updateEntry(
    id: string,
    patch: KnowledgeEntryPatch,
  ): Promise<KnowledgeBase> {
    const existing = await this.findEditable(id);
    const data: Prisma.KnowledgeBaseUpdateInput = { ...patch };

    if (patch.title !== undefined || patch.content !== undefined) {
      const title = patch.title ?? existing.title;
      const content = patch.content ?? existing.content;
      data.embedding = await this.embedOrEmpty(`${title}
${content}`);
    }

    return this.prisma.knowledgeBase.update({ where: { id }, data });
  }

  async deleteEntry(id: string): Promise<void> {
    await this.findEditable(id);
    await this.prisma.knowledgeBase.delete({ where: { id } });
  }

  private async upsertSss(sss: Sss): Promise<void> {
    const content = `Soru: ${sss.question}\nCevap: ${sss.answer}`;
    const [embedding] = await this.openai.embed([content]);

    const data = {
      category: KnowledgeCategory.SSS,
      source: KnowledgeSource.SSS,
      sourceRefId: sss.id,
      title: sss.question,
      content,
      embedding,
      isActive: sss.isActive,
    };

    await this.upsertBySource(KnowledgeSource.SSS, sss.id, data);
  }

  private async upsertBySource(
    source: KnowledgeSource,
    sourceRefId: string,
    data: Prisma.KnowledgeBaseUncheckedCreateInput,
  ): Promise<KnowledgeBase> {
    const existing = await this.prisma.knowledgeBase.findFirst({
      where: { source, sourceRefId },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.knowledgeBase.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.knowledgeBase.create({ data });
  }

  private async embedOrEmpty(text: string): Promise<number[]> {
    try {
      const [vector] = await this.openai.embed([text]);
      return vector;
    } catch (error) {
      if (error instanceof OpenAiUnavailableError) {
        this.logger.warn(
          'Bilgi bankası kaydı embedding olmadan kaydedildi: OpenAI yok',
        );
        return [];
      }
      throw error;
    }
  }

  private async findEditable(id: string): Promise<KnowledgeBase> {
    const entry = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Bilgi bankası kaydı bulunamadı.');
    }
    if (entry.source === KnowledgeSource.SSS) {
      throw new ConflictException(
        'SSS kaynaklı kayıtlar SSS ekranından yönetilir.',
      );
    }
    return entry;
  }

  private async removeSss(sssId: string): Promise<void> {
    await this.prisma.knowledgeBase.deleteMany({
      where: { source: KnowledgeSource.SSS, sourceRefId: sssId },
    });
  }
}
