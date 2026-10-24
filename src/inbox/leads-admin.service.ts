import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';

export interface ListLeadsParams {
  status?: string;
  page: number;
  limit: number;
}

function normalizePage(page: number): number {
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function normalizeLimit(limit: number): number {
  return Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
}

function isLeadStatus(value: string): value is LeadStatus {
  return (Object.values(LeadStatus) as string[]).includes(value);
}

@Injectable()
export class LeadsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  async list(params: ListLeadsParams) {
    const page = normalizePage(params.page);
    const limit = normalizeLimit(params.limit);

    const where: Prisma.LeadWhereInput = {};
    if (params.status) {
      if (!isLeadStatus(params.status)) {
        throw new BadRequestException('Geçersiz arama talebi durumu.');
      }
      where.status = params.status;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              instagramId: true,
            },
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto) {
    const existing = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Arama talebi bulunamadı.');
    }

    const lead = await this.prisma.lead.update({
      where: { id },
      data: { status: dto.status },
    });
    this.inboxEvents.emit('counts.changed', {});
    return lead;
  }
}
