import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePagination, paginated } from '../../common/pagination';
import {
  buildContactWhere,
  MAX_FILTER_CONTACTS,
} from '../contacts/contact-filter';
import {
  AddByFilterDto,
  ContactIdsDto,
  CreateContactListDto,
  ListMembersQueryDto,
  UpdateContactListDto,
} from './dto/contact-list.dto';

const LIST_NAME_TAKEN = 'Bu liste adı zaten kullanılıyor.';
const LIST_NOT_FOUND = 'Liste bulunamadı.';
const FILTER_TOO_LARGE = 'Filtre 5000 kişiden fazla';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

const MEMBER_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  channel: true,
  lifecycleStatus: true,
  contactType: true,
  marketingOptOut: true,
  reminderOptOut: true,
} as const;

@Injectable()
export class ContactListsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const lists = await this.prisma.contactList.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { members: true } },
      },
    });
    return lists.map(({ _count, ...list }) => ({
      ...list,
      memberCount: _count.members,
    }));
  }

  async create(dto: CreateContactListDto, userId?: string) {
    const name = dto.name.trim();
    await this.ensureNameFree(name);
    try {
      return await this.prisma.contactList.create({
        data: {
          name,
          description: dto.description?.trim() || null,
          createdById: userId ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(LIST_NAME_TAKEN);
      throw error;
    }
  }

  async update(id: string, dto: UpdateContactListDto) {
    await this.ensureExists(id);
    const data: Prisma.ContactListUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.ensureNameFree(name, id);
      data.name = name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }
    try {
      return await this.prisma.contactList.update({ where: { id }, data });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(LIST_NAME_TAKEN);
      throw error;
    }
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.contactList.delete({ where: { id } });
    return { ok: true };
  }

  async members(id: string, query: ListMembersQueryDto) {
    await this.ensureExists(id);
    const { page, limit, skip } = parsePagination(query.page, query.limit, {
      maxLimit: 100,
    });
    const where = { listId: id };
    const [rows, total] = await Promise.all([
      this.prisma.contactListMember.findMany({
        where,
        orderBy: { addedAt: 'desc' },
        skip,
        take: limit,
        select: { addedAt: true, contact: { select: MEMBER_SELECT } },
      }),
      this.prisma.contactListMember.count({ where }),
    ]);
    const data = rows.map((row) => ({ ...row.contact, addedAt: row.addedAt }));
    return paginated(data, total, page, limit);
  }

  async addContacts(id: string, dto: ContactIdsDto) {
    await this.ensureExists(id);
    const contactIds = [...new Set(dto.contactIds)];
    // Var olmayan kişi FK hatası (500) yerine 400 ile reddedilir.
    const existing = await this.prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true },
    });
    const missing = contactIds.length - existing.length;
    if (missing > 0) {
      throw new BadRequestException(`${missing} kişi bulunamadı`);
    }
    const result = await this.prisma.contactListMember.createMany({
      data: contactIds.map((contactId) => ({ listId: id, contactId })),
      skipDuplicates: true,
    });
    return { added: result.count };
  }

  // Filtreye uyan kişiler; sınır aşılırsa hiçbiri eklenmez.
  async addByFilter(id: string, dto: AddByFilterDto) {
    await this.ensureExists(id);
    const matches = await this.prisma.contact.findMany({
      where: buildContactWhere(dto.filter),
      select: { id: true },
      take: MAX_FILTER_CONTACTS + 1,
    });
    if (matches.length > MAX_FILTER_CONTACTS) {
      throw new BadRequestException(FILTER_TOO_LARGE);
    }
    const result = await this.prisma.contactListMember.createMany({
      data: matches.map((contact) => ({ listId: id, contactId: contact.id })),
      skipDuplicates: true,
    });
    return { matched: matches.length, added: result.count };
  }

  async removeContacts(id: string, dto: ContactIdsDto) {
    await this.ensureExists(id);
    const result = await this.prisma.contactListMember.deleteMany({
      where: { listId: id, contactId: { in: dto.contactIds } },
    });
    return { removed: result.count };
  }

  private async ensureExists(id: string): Promise<void> {
    const list = await this.prisma.contactList.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!list) throw new NotFoundException(LIST_NOT_FOUND);
  }

  // Ad karşılaştırması büyük-küçük harf duyarsızdır.
  private async ensureNameFree(name: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.contactList.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (taken) throw new ConflictException(LIST_NAME_TAKEN);
  }
}
