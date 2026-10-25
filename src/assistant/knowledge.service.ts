import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KnowledgeBase,
  KnowledgeCategory,
  KnowledgeSource,
  Prisma,
  Sss,
  SssPage,
  UnansweredStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { normalizeForCrisis } from '../webhooks/crisis-keywords';
import { OpenAiClient, OpenAiUnavailableError } from './openai.client';

const MAX_RESULTS = 4;
const DEFAULT_THRESHOLD = 0.4;
// OpenAI embedding isteği başına en fazla metin sayısı.
const EMBED_BATCH_SIZE = 50;
// Bu benzerlik üstündeki açık sorular aynı soru sayılır.
const SIMILAR_QUESTION_THRESHOLD = 0.85;
const MIN_QUESTION_LENGTH = 8;
const UNSUPPORTED_PREFIX = '[desteklenmeyen mesaj tipi';
// Yalnızca selamlaşma ve onay ifadeleri (ASCII, noktalama yok).
const SMALL_TALK = new Set([
  'merhaba',
  'selam',
  'selamlar',
  'slm',
  'mrb',
  'tesekkurler',
  'tesekkur ederim',
  'sagol',
  'sagolun',
  'tamam',
  'tamamdir',
  'ok',
  'okey',
  'evet',
  'hayir',
  'iyi gunler',
  'iyi aksamlar',
  'gorusuruz',
  'peki',
  'anladim',
]);

// Metni ASCII'ye indirir, noktalama ve emojiyi atar, boşlukları sadeleştirir.
export function isSmallTalk(text: string): boolean {
  const normalized = normalizeForCrisis(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 && SMALL_TALK.has(normalized);
}

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
  source: KnowledgeSource;
  score: number;
}

export interface KnowledgeSearchResult {
  items: KnowledgeItem[];
  topScore: number | null;
  threshold: number;
}

export interface ReindexResult {
  indexed: number;
  skipped: number;
}

export interface ReindexMissingResult {
  processed: number;
  failed: number;
  remaining: number;
}

// SSS kayıtları yalnızca içeriğiyle, diğerleri başlık + içerikle indekslenir.
function sssContent(sss: Sss): string {
  return `Soru: ${sss.question}\nCevap: ${sss.answer}`;
}

function embeddingText(row: {
  title: string;
  content: string;
  source: KnowledgeSource;
}): string {
  return row.source === KnowledgeSource.SSS
    ? row.content
    : `${row.title}\n${row.content}`;
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
export class KnowledgeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(KnowledgeService.name);
  private readonly threshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiClient,
    private readonly config: ConfigService,
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

  // Açılışı bekletmez: eksik embedding'ler arka planda tamamlanır.
  onApplicationBootstrap(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      !this.config.get<string>('OPENAI_API_KEY')
    ) {
      return;
    }
    this.reindexMissing()
      .then((result) =>
        this.logger.log(
          `Açılış indeksleme: ${result.processed} tamam, ${result.failed} hatalı, ${result.remaining} kalan`,
        ),
      )
      .catch((error: unknown) =>
        this.logger.warn(`Açılış indeksleme başarısız: ${String(error)}`),
      );
  }

  // Metinleri 50'lik gruplarla OpenAI'ye gönderir; sıra korunur.
  async embedMany(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = await this.openai.embed(
        texts.slice(i, i + EMBED_BATCH_SIZE),
      );
      vectors.push(...batch);
    }
    return vectors;
  }

  async search(query: string): Promise<KnowledgeSearchResult> {
    const threshold = this.threshold;
    let queryVector: number[];
    try {
      [queryVector] = await this.openai.embed([query]);
    } catch (error) {
      if (error instanceof OpenAiUnavailableError) {
        return { items: [], topScore: null, threshold };
      }
      throw error;
    }

    const rows = await this.prisma.knowledgeBase.findMany({
      where: { isActive: true },
      select: {
        id: true,
        title: true,
        content: true,
        source: true,
        embedding: true,
      },
    });

    const scored = rows
      .filter((row) => row.embedding.length > 0)
      .map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        source: row.source,
        score: cosineSimilarity(queryVector, row.embedding),
      }))
      .sort((a, b) => b.score - a.score);

    return {
      items: scored
        .filter((item) => item.score >= threshold)
        .slice(0, MAX_RESULTS),
      topScore: scored.length > 0 ? scored[0].score : null,
      threshold,
    };
  }

  // Embedding'i boş olan tüm kayıtları (aktif/pasif fark etmez) indeksler.
  async reindexMissing(): Promise<ReindexMissingResult> {
    const rows = await this.prisma.knowledgeBase.findMany({
      where: { embedding: { isEmpty: true } },
      select: { id: true, title: true, content: true, source: true },
    });

    let processed = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
      const batch = rows.slice(i, i + EMBED_BATCH_SIZE);
      let vectors: number[][];
      try {
        vectors = await this.embedMany(batch.map(embeddingText));
      } catch (error) {
        if (error instanceof OpenAiUnavailableError) {
          throw error;
        }
        this.logger.warn(`Embedding toplu indeksleme hatası: ${String(error)}`);
        failed += batch.length;
        continue;
      }

      for (let j = 0; j < batch.length; j++) {
        await this.prisma.knowledgeBase.update({
          where: { id: batch[j].id },
          data: { embedding: vectors[j] },
        });
        processed++;
      }
    }

    const remaining = await this.prisma.knowledgeBase.count({
      where: { embedding: { isEmpty: true } },
    });
    return { processed, failed, remaining };
  }

  async syncSss(sssId: string): Promise<void> {
    const sss = await this.prisma.sss.findUnique({ where: { id: sssId } });
    if (!sss || !sss.isActive) {
      await this.removeSss(sssId);
      return;
    }
    if (sss.page === SssPage.UZMAN) {
      await this.deactivateUzmanSss(sssId);
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
    const active: Sss[] = [];

    for (const sss of all) {
      if (!sss.isActive) {
        await this.removeSss(sss.id);
        skipped++;
      } else if (sss.page === SssPage.UZMAN) {
        await this.deactivateUzmanSss(sss.id);
        skipped++;
      } else {
        active.push(sss);
      }
    }
    if (active.length === 0) {
      return { indexed, skipped };
    }

    let vectors: number[][];
    try {
      vectors = await this.embedMany(active.map(sssContent));
    } catch (error) {
      if (error instanceof OpenAiUnavailableError) {
        return { indexed, skipped: skipped + active.length };
      }
      throw error;
    }

    for (let i = 0; i < active.length; i++) {
      await this.upsertSss(active[i], vectors[i]);
      indexed++;
    }

    return { indexed, skipped };
  }

  async recordUnanswered(
    conversationId: string,
    question: string,
    topScore: number | null,
  ): Promise<void> {
    // Anlamsız, selamlaşma ve puanı hesaplanamayan sorular kaydedilmez.
    const text = question.trim();
    if (
      text.length < MIN_QUESTION_LENGTH ||
      isSmallTalk(text) ||
      text.startsWith(UNSUPPORTED_PREFIX) ||
      topScore === null
    ) {
      return;
    }

    const embedding = await this.embedQuestion(text);
    const similar =
      embedding.length > 0 ? await this.findSimilarOpen(embedding) : null;

    if (similar) {
      await this.prisma.unansweredQuestion.update({
        where: { id: similar.id },
        data: {
          askCount: { increment: 1 },
          lastAskedAt: new Date(),
          question: text,
          topScore:
            similar.topScore === null
              ? topScore
              : Math.max(similar.topScore, topScore),
        },
      });
    } else {
      await this.prisma.unansweredQuestion.create({
        data: { conversationId, question: text, topScore, embedding },
      });
    }
    this.inboxEvents.emit('counts.changed', {});
  }

  // Soru embedding'i alınamazsa boş döner; kayıt yine de yapılır.
  private async embedQuestion(text: string): Promise<number[]> {
    try {
      const [vector] = await this.openai.embed([text]);
      return vector ?? [];
    } catch (error) {
      if (!(error instanceof OpenAiUnavailableError)) {
        this.logger.warn(`Soru embedding hatası: ${String(error)}`);
      }
      return [];
    }
  }

  // Açık sorular arasında eşiğin üstünde en benzer olanı bulur.
  private async findSimilarOpen(embedding: number[]): Promise<{
    id: string;
    topScore: number | null;
  } | null> {
    const open = await this.prisma.unansweredQuestion.findMany({
      where: { status: UnansweredStatus.OPEN },
      select: { id: true, topScore: true, embedding: true },
    });

    let best: { id: string; topScore: number | null } | null = null;
    let bestScore = SIMILAR_QUESTION_THRESHOLD;
    for (const row of open) {
      if (row.embedding.length === 0) {
        continue;
      }
      const score = cosineSimilarity(embedding, row.embedding);
      if (score >= bestScore) {
        bestScore = score;
        best = { id: row.id, topScore: row.topScore };
      }
    }
    return best;
  }

  // SSS UZMAN sayfasına taşındıysa bilgi bankası kaydı silinmez, pasifleşir.
  private async deactivateUzmanSss(sssId: string): Promise<void> {
    await this.prisma.knowledgeBase.updateMany({
      where: { source: KnowledgeSource.SSS, sourceRefId: sssId },
      data: { isActive: false },
    });
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

  private async upsertSss(sss: Sss, precomputed?: number[]): Promise<void> {
    const content = sssContent(sss);
    const embedding = precomputed ?? (await this.openai.embed([content]))[0];

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
