import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto/contact-tag.dto';

const TAG_NAME_TAKEN = 'Bu etiket adı zaten kullanılıyor.';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const tags = await this.prisma.contactTag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { contacts: true } } },
    });
    return tags.map(({ _count, ...tag }) => ({
      ...tag,
      contactCount: _count.contacts,
    }));
  }

  async create(dto: CreateTagDto) {
    const name = dto.name.trim();
    await this.ensureNameFree(name);
    try {
      return await this.prisma.contactTag.create({
        data: { name, color: dto.color ?? 'gray' },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(TAG_NAME_TAKEN);
      throw error;
    }
  }

  async update(id: string, dto: UpdateTagDto) {
    await this.ensureExists(id);
    const data: Prisma.ContactTagUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.ensureNameFree(name, id);
      data.name = name;
    }
    if (dto.color !== undefined) data.color = dto.color;
    try {
      return await this.prisma.contactTag.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(TAG_NAME_TAKEN);
      throw error;
    }
  }

  // Implicit m2m bağları veritabanı tarafından otomatik kaldırılır.
  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.contactTag.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureExists(id: string): Promise<void> {
    const tag = await this.prisma.contactTag.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!tag) throw new NotFoundException('Etiket bulunamadı.');
  }

  // Ad karşılaştırması büyük-küçük harf duyarsızdır.
  private async ensureNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.contactTag.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(TAG_NAME_TAKEN);
  }
}
