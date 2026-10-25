import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCannedResponseDto,
  UpdateCannedResponseDto,
} from './dto/canned-response.dto';

const SHORTCUT_TAKEN = 'Bu kısayol başka bir hazır cevapta kullanılıyor.';
const LIST_LIMIT = 200;

const SELECT_FIELDS = {
  id: true,
  title: true,
  content: true,
  shortcut: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CannedResponseSelect;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class CannedResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  // q verilirse başlık, içerik ve kısayolda duyarsız arama yapar.
  async list(q?: string) {
    const term = q?.trim();
    const where: Prisma.CannedResponseWhereInput = term
      ? {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { content: { contains: term, mode: 'insensitive' } },
            { shortcut: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};
    return this.prisma.cannedResponse.findMany({
      where,
      select: SELECT_FIELDS,
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  async create(dto: CreateCannedResponseDto, userId: string) {
    if (dto.shortcut) await this.ensureShortcutFree(dto.shortcut);
    try {
      return await this.prisma.cannedResponse.create({
        data: {
          title: dto.title,
          content: dto.content,
          shortcut: dto.shortcut ?? null,
          createdById: userId,
        },
        select: SELECT_FIELDS,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(SHORTCUT_TAKEN);
      throw error;
    }
  }

  async update(id: string, dto: UpdateCannedResponseDto) {
    await this.ensureExists(id);
    const data: Prisma.CannedResponseUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.shortcut !== undefined) {
      if (dto.shortcut) await this.ensureShortcutFree(dto.shortcut, id);
      data.shortcut = dto.shortcut ?? null;
    }
    try {
      return await this.prisma.cannedResponse.update({
        where: { id },
        data,
        select: SELECT_FIELDS,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(SHORTCUT_TAKEN);
      throw error;
    }
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.cannedResponse.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.cannedResponse.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Hazır cevap bulunamadı.');
  }

  private async ensureShortcutFree(
    shortcut: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.cannedResponse.findFirst({
      where: {
        shortcut,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(SHORTCUT_TAKEN);
  }
}
