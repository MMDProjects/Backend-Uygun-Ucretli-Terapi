import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SssPage } from '@prisma/client';

@Injectable()
export class SssService {
  constructor(private prisma: PrismaService) {}

  findByPage(page?: SssPage) {
    return this.prisma.sss.findMany({
      where: { isActive: true, ...(page && { page }) },
      orderBy: { order: 'asc' },
      select: { id: true, question: true, answer: true, page: true },
    });
  }
}
