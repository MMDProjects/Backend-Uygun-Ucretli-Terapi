import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KnowledgeBase,
  KnowledgeSource,
  Prisma,
  UnansweredStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { KnowledgeService } from '../assistant/knowledge.service';
import { parsePagination } from '../common/pagination';
import { ResolveUnansweredDto } from './dto/resolve-unanswered.dto';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';

const PII_CONFIRM_MESSAGE =
  'Bilgi bankasına eklemeden önce kişisel bilgilerin çıkarıldığını onaylayın.';

export interface ListPagedParams {
  page: number;
  limit: number;
}

export interface ListUnansweredParams extends ListPagedParams {
  status?: string;
}

export interface ListKnowledgeParams extends ListPagedParams {
  source?: string;
  q?: string;
}

function isUnansweredStatus(value: string): value is UnansweredStatus {
  return (Object.values(UnansweredStatus) as string[]).includes(value);
}

function isKnowledgeSource(value: string): value is KnowledgeSource {
  return (Object.values(KnowledgeSource) as string[]).includes(value);
}

function toKnowledgeView(entry: KnowledgeBase) {
  const { embedding, ...rest } = entry;
  return { ...rest, hasEmbedding: embedding.length > 0 };
}

@Injectable()
export class KnowledgeAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  async listUnanswered(params: ListUnansweredParams) {
    const { page, limit } = parsePagination(params.page, params.limit);

    const where: Prisma.UnansweredQuestionWhereInput = {};
    if (params.status) {
      if (!isUnansweredStatus(params.status)) {
        throw new BadRequestException('Geçersiz soru durumu.');
      }
      where.status = params.status;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.unansweredQuestion.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          question: true,
          topScore: true,
          status: true,
          createdAt: true,
          conversationId: true,
          conversation: {
            select: { contact: { select: { id: true, fullName: true } } },
          },
        },
      }),
      this.prisma.unansweredQuestion.count({ where }),
    ]);

    const data = rows.map(({ conversation, ...rest }) => ({
      ...rest,
      contact: conversation.contact,
    }));

    return { data, total, page, limit };
  }

  async resolveUnanswered(id: string, dto: ResolveUnansweredDto) {
    await this.ensureQuestion(id);

    if (dto.addToKnowledge) {
      if (dto.piiConfirmed !== true) {
        throw new BadRequestException(PII_CONFIRM_MESSAGE);
      }
      if (!dto.category || !dto.title?.trim() || !dto.content?.trim()) {
        throw new BadRequestException(
          'Bilgi bankasına eklemek için kategori, başlık ve içerik zorunludur.',
        );
      }
      await this.knowledge.createEntry({
        category: dto.category,
        title: dto.title,
        content: dto.content,
        source: KnowledgeSource.CONVERSATION,
        sourceRefId: id,
      });
    }

    return this.markResolved(id);
  }

  async dismissUnanswered(id: string) {
    await this.ensureQuestion(id);
    return this.markResolved(id);
  }

  async listKnowledge(params: ListKnowledgeParams) {
    const { page, limit } = parsePagination(params.page, params.limit);

    const where: Prisma.KnowledgeBaseWhereInput = {};
    if (params.source) {
      if (!isKnowledgeSource(params.source)) {
        throw new BadRequestException('Geçersiz kaynak filtresi.');
      }
      where.source = params.source;
    }
    const q = params.q?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.knowledgeBase.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.knowledgeBase.count({ where }),
    ]);

    return { data: rows.map(toKnowledgeView), total, page, limit };
  }

  async createKnowledge(dto: CreateKnowledgeDto) {
    if (dto.piiConfirmed !== true) {
      throw new BadRequestException(PII_CONFIRM_MESSAGE);
    }
    const entry = await this.knowledge.createEntry({
      category: dto.category,
      title: dto.title,
      content: dto.content,
      source: dto.source ?? KnowledgeSource.MANUAL,
      sourceRefId: null,
    });
    return toKnowledgeView(entry);
  }

  async updateKnowledge(id: string, dto: UpdateKnowledgeDto) {
    const entry = await this.knowledge.updateEntry(id, {
      category: dto.category,
      title: dto.title,
      content: dto.content,
      isActive: dto.isActive,
    });
    return toKnowledgeView(entry);
  }

  async deleteKnowledge(id: string) {
    await this.knowledge.deleteEntry(id);
    return { ok: true };
  }

  private async ensureQuestion(id: string): Promise<void> {
    const question = await this.prisma.unansweredQuestion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!question) {
      throw new NotFoundException('Soru bulunamadı.');
    }
  }

  private async markResolved(id: string) {
    const updated = await this.prisma.unansweredQuestion.update({
      where: { id },
      data: { status: UnansweredStatus.RESOLVED },
    });
    this.inboxEvents.emit('counts.changed', {});
    return updated;
  }
}
