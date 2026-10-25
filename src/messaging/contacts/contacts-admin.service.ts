import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePagination, paginated } from '../../common/pagination';
import { buildContactWhere } from './contact-filter';
import { ListContactsQueryDto } from './dto/contact-filter.dto';
import { UpdateOptOutDto } from './dto/update-opt-out.dto';

const CONTACT_ROW_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  channel: true,
  lifecycleStatus: true,
  contactType: true,
  marketingOptOut: true,
  reminderOptOut: true,
  optOutAt: true,
  lastActiveAt: true,
  tags: { select: { id: true, name: true, color: true } },
} as const;

@Injectable()
export class ContactsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListContactsQueryDto) {
    const { page, limit, skip } = parsePagination(query.page, query.limit, {
      maxLimit: 100,
    });
    const where = buildContactWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        select: CONTACT_ROW_SELECT,
        orderBy: { lastActiveAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return paginated(rows, total, page, limit);
  }

  // Alan verilmeyen bayrak değişmez. Hiçbir bayrak kalmazsa optOutAt temizlenir.
  async updateOptOut(id: string, dto: UpdateOptOutDto) {
    if (dto.marketingOptOut === undefined && dto.reminderOptOut === undefined) {
      throw new BadRequestException('En az bir DUR alanı gönderilmeli.');
    }
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      select: { id: true, marketingOptOut: true, reminderOptOut: true },
    });
    if (!contact) throw new NotFoundException('Kişi bulunamadı');

    const marketingOptOut = dto.marketingOptOut ?? contact.marketingOptOut;
    const reminderOptOut = dto.reminderOptOut ?? contact.reminderOptOut;
    const anyOptOut = marketingOptOut || reminderOptOut;
    return this.prisma.contact.update({
      where: { id },
      data: {
        marketingOptOut,
        reminderOptOut,
        optOutAt: anyOptOut ? new Date() : null,
      },
      select: CONTACT_ROW_SELECT,
    });
  }
}
