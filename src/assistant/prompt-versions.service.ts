import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PROMPT_MAX_CHARS, PROMPT_MIN_CHARS } from './dto/prompt-version.dto';
import { ELIF_SYSTEM_PROMPT } from './prompts/elif-system-prompt';

const PRICE_PLACEHOLDER = '{{FIYAT_TABLOSU}}';
const CACHE_TTL_MS = 30_000;
const P2002 = 'P2002';

export interface ActivePromptView {
  source: 'db' | 'code';
  id?: string;
  version?: number;
  content: string;
}

export interface PromptVersionItem {
  id: string;
  version: number;
  note: string | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: { firstName: string; lastName: string } | null;
}

const VERSION_SELECT = {
  id: true,
  version: true,
  note: true,
  isActive: true,
  createdAt: true,
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.AssistantPromptSelect;

@Injectable()
export class PromptVersionsService {
  private readonly logger = new Logger(PromptVersionsService.name);
  private cache: { value: ActivePromptView; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // İçerik doğrulaması: uzunluk ve fiyat tablosu yer tutucusu.
  validateContent(content: string): void {
    if (
      content.length < PROMPT_MIN_CHARS ||
      content.length > PROMPT_MAX_CHARS
    ) {
      throw new BadRequestException(
        `Prompt ${PROMPT_MIN_CHARS} ile ${PROMPT_MAX_CHARS} karakter arasında olmalı.`,
      );
    }
    if (!content.includes(PRICE_PLACEHOLDER)) {
      throw new BadRequestException(
        'Fiyat tablosu yer tutucusu silinmiş ({{FIYAT_TABLOSU}} bulunmalı).',
      );
    }
  }

  // Aktif içerik: aktif DB sürümü yoksa kod içi varsayılan. Hata olursa varsayılan kullanılır.
  async getActiveContent(): Promise<string> {
    const active = await this.getActive();
    return active.content;
  }

  async getActive(): Promise<ActivePromptView> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;

    try {
      const row = await this.prisma.assistantPrompt.findFirst({
        where: { isActive: true },
        select: { id: true, version: true, content: true },
      });
      const value: ActivePromptView = row
        ? {
            source: 'db',
            id: row.id,
            version: row.version,
            content: row.content,
          }
        : { source: 'code', content: ELIF_SYSTEM_PROMPT };
      this.cache = { value, expiresAt: now + CACHE_TTL_MS };
      return value;
    } catch (err) {
      this.logger.error(
        'Aktif Elif promptu okunamadı, kod içi varsayılan kullanılıyor',
        err as Error,
      );
      return { source: 'code', content: ELIF_SYSTEM_PROMPT };
    }
  }

  // Sürüm listesi (içerik hariç) ve aktif sürüm bilgisi.
  async list(): Promise<{
    active: { source: 'db' | 'code'; id?: string; version?: number };
    items: PromptVersionItem[];
  }> {
    const items = await this.prisma.assistantPrompt.findMany({
      orderBy: { version: 'desc' },
      select: VERSION_SELECT,
    });
    const activeItem = items.find((item) => item.isActive);
    return {
      active: activeItem
        ? { source: 'db', id: activeItem.id, version: activeItem.version }
        : { source: 'code' },
      items,
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.assistantPrompt.findUnique({
      where: { id },
      select: { ...VERSION_SELECT, content: true },
    });
    if (!row) {
      throw new NotFoundException('Prompt sürümü bulunamadı.');
    }
    return row;
  }

  async create(
    input: { content: string; note?: string; activate?: boolean },
    actorUserId: string,
  ) {
    this.validateContent(input.content);
    const note = input.note?.trim() || null;
    const activate = input.activate === true;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const max = await tx.assistantPrompt.aggregate({
          _max: { version: true },
        });
        const version = (max._max.version ?? 0) + 1;
        if (activate) {
          await tx.assistantPrompt.updateMany({
            where: { isActive: true },
            data: { isActive: false },
          });
        }
        return tx.assistantPrompt.create({
          data: {
            version,
            content: input.content,
            note,
            isActive: activate,
            createdById: actorUserId,
          },
          select: VERSION_SELECT,
        });
      });
      this.invalidate();
      this.logger.log(
        `Elif prompt sürümü ${created.version} oluşturuldu${activate ? ' ve etkinleştirildi' : ''} (kullanıcı: ${actorUserId})`,
      );
      return created;
    } catch (err) {
      if (this.isUniqueConflict(err)) {
        throw new ConflictException('Sürüm numarası çakıştı, tekrar deneyin.');
      }
      throw err;
    }
  }

  // Geri dönüş de bu işlemle yapılır. Tek aktif sürüm transaction ile korunur.
  async activate(id: string, actorUserId: string) {
    const target = await this.prisma.assistantPrompt.findUnique({
      where: { id },
      select: { id: true, version: true },
    });
    if (!target) {
      throw new NotFoundException('Prompt sürümü bulunamadı.');
    }
    await this.prisma.$transaction([
      this.prisma.assistantPrompt.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      }),
      this.prisma.assistantPrompt.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);
    this.invalidate();
    this.logAction('etkinleştirildi', target.version, actorUserId);
    return this.findOne(id);
  }

  // Kod içi varsayılana döner.
  async deactivate(actorUserId: string): Promise<{ source: 'code' }> {
    await this.prisma.assistantPrompt.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    this.invalidate();
    this.logger.log(
      `Elif promptu kod içi varsayılana döndürüldü (kullanıcı: ${actorUserId})`,
    );
    return { source: 'code' };
  }

  invalidate(): void {
    this.cache = null;
  }

  private logAction(action: string, version: number, actorUserId: string) {
    this.logger.log(
      `Elif prompt sürümü ${version} ${action} (kullanıcı: ${actorUserId})`,
    );
  }

  private isUniqueConflict(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002
    );
  }
}
