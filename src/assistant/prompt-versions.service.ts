import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PROMPT_ADDENDUM_MAX_CHARS,
  PROMPT_MAX_CHARS,
  PROMPT_MIN_CHARS,
} from './dto/prompt-version.dto';
import { ELIF_SYSTEM_PROMPT } from './prompts/elif-system-prompt';

const PRICE_PLACEHOLDER = '{{FIYAT_TABLOSU}}';
const CACHE_TTL_MS = 30_000;
const P2002 = 'P2002';

// Bir sürümün üç parçası: ana metin ve iki kanal eki.
export interface PromptAddenda {
  whatsappAddendum: string | null;
  instagramAddendum: string | null;
}

export interface ActivePrompt extends PromptAddenda {
  content: string;
}

export interface ActivePromptView extends ActivePrompt {
  source: 'db' | 'code';
  id?: string;
  version?: number;
}

export interface PromptVersionItem {
  id: string;
  version: number;
  note: string | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: { firstName: string; lastName: string } | null;
  hasWhatsappAddendum: boolean;
  hasInstagramAddendum: boolean;
}

const VERSION_SELECT = {
  id: true,
  version: true,
  note: true,
  isActive: true,
  createdAt: true,
  createdBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.AssistantPromptSelect;

// Ekler dahil tek sürüm görünümü.
const DETAIL_SELECT = {
  ...VERSION_SELECT,
  content: true,
  whatsappAddendum: true,
  instagramAddendum: true,
} satisfies Prisma.AssistantPromptSelect;

// Boş ya da yalnız boşluktan oluşan ek, null olarak saklanır.
function normalizeAddendum(value: string | null | undefined): string | null {
  return value?.trim() ? value : null;
}

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

  // Kanal eklerinin uzunluk kontrolü. null ve boş değer kabul edilir.
  validateAddenda(addenda: Partial<PromptAddenda>): void {
    for (const value of [addenda.whatsappAddendum, addenda.instagramAddendum]) {
      if (value && value.length > PROMPT_ADDENDUM_MAX_CHARS) {
        throw new BadRequestException(
          `Kanal eki en fazla ${PROMPT_ADDENDUM_MAX_CHARS} karakter olabilir.`,
        );
      }
    }
  }

  // Aktif içerik: aktif DB sürümü yoksa kod içi varsayılan. Hata olursa varsayılan kullanılır.
  async getActiveContent(): Promise<string> {
    const active = await this.getActive();
    return active.content;
  }

  // Aktif ana metin ve iki kanal eki. Önbellek getActive ile aynıdır.
  async getActivePrompt(): Promise<ActivePrompt> {
    const { content, whatsappAddendum, instagramAddendum } =
      await this.getActive();
    return { content, whatsappAddendum, instagramAddendum };
  }

  async getActive(): Promise<ActivePromptView> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.value;

    try {
      const row = await this.prisma.assistantPrompt.findFirst({
        where: { isActive: true },
        select: {
          id: true,
          version: true,
          content: true,
          whatsappAddendum: true,
          instagramAddendum: true,
        },
      });
      const value: ActivePromptView = row
        ? {
            source: 'db',
            id: row.id,
            version: row.version,
            content: row.content,
            whatsappAddendum: row.whatsappAddendum,
            instagramAddendum: row.instagramAddendum,
          }
        : {
            source: 'code',
            content: ELIF_SYSTEM_PROMPT,
            whatsappAddendum: null,
            instagramAddendum: null,
          };
      this.cache = { value, expiresAt: now + CACHE_TTL_MS };
      return value;
    } catch (err) {
      this.logger.error(
        'Aktif Elif promptu okunamadı, kod içi varsayılan kullanılıyor',
        err as Error,
      );
      return {
        source: 'code',
        content: ELIF_SYSTEM_PROMPT,
        whatsappAddendum: null,
        instagramAddendum: null,
      };
    }
  }

  // Sürüm listesi (içerik hariç) ve aktif sürüm bilgisi.
  async list(): Promise<{
    active: { source: 'db' | 'code'; id?: string; version?: number };
    items: PromptVersionItem[];
  }> {
    const rows = await this.prisma.assistantPrompt.findMany({
      orderBy: { version: 'desc' },
      select: {
        ...VERSION_SELECT,
        whatsappAddendum: true,
        instagramAddendum: true,
      },
    });
    // Ek metinleri listede taşınmaz; yalnızca dolu olup olmadığı döner.
    const items: PromptVersionItem[] = rows.map(
      ({ whatsappAddendum, instagramAddendum, ...rest }) => ({
        ...rest,
        hasWhatsappAddendum: normalizeAddendum(whatsappAddendum) !== null,
        hasInstagramAddendum: normalizeAddendum(instagramAddendum) !== null,
      }),
    );
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
      select: DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Prompt sürümü bulunamadı.');
    }
    return row;
  }

  async create(
    input: {
      content: string;
      whatsappAddendum?: string | null;
      instagramAddendum?: string | null;
      note?: string;
      activate?: boolean;
    },
    actorUserId: string,
  ) {
    this.validateContent(input.content);
    this.validateAddenda(input);
    const note = input.note?.trim() || null;
    const activate = input.activate === true;
    const addenda: PromptAddenda = {
      whatsappAddendum: normalizeAddendum(input.whatsappAddendum),
      instagramAddendum: normalizeAddendum(input.instagramAddendum),
    };

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
            ...addenda,
            note,
            isActive: activate,
            createdById: actorUserId,
          },
          select: DETAIL_SELECT,
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
  // Ana metin ve iki ek birlikte etkinleşir.
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
