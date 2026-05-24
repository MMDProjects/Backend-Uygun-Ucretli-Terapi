import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveResultDto } from './dto/save-result.dto';
import { User } from '@prisma/client';

@Injectable()
export class TestsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.test.findMany({
      where: { isActive: true },
      select: { id: true, title: true, slug: true, description: true },
    });
  }

  async findBySlug(slug: string) {
    const test = await this.prisma.test.findUnique({ where: { slug } });
    if (!test || !test.isActive) throw new NotFoundException('Test bulunamadı');
    return test;
  }

  async saveResult(user: User, dto: SaveResultDto) {
    const test = await this.prisma.test.findUnique({ where: { id: dto.testId } });
    if (!test) throw new NotFoundException('Test bulunamadı');

    return this.prisma.testResult.create({
      data: { userId: user.id, testId: dto.testId, scoreSummary: dto.scoreSummary },
    });
  }

  async getHistory(userId: string) {
    return this.prisma.testResult.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { test: { select: { title: true, slug: true } } },
    });
  }
}
