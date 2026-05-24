import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { User } from '@prisma/client';

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async create(user: User, expertProfileId: string, dto: CreateCommentDto) {
    const expert = await this.prisma.expertProfile.findUnique({ where: { id: expertProfileId } });
    if (!expert) throw new NotFoundException('Uzman bulunamadı');

    return this.prisma.comment.create({
      data: {
        userId: user.id,
        expertProfileId,
        content: dto.content,
        rating: dto.rating,
      },
    });
  }

  async findApproved(expertProfileId: string) {
    return this.prisma.comment.findMany({
      where: { expertProfileId, isApproved: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        rating: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async approve(id: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Yorum bulunamadı');

    await this.prisma.comment.update({ where: { id }, data: { isApproved: true } });

    // Rating ortalamasını yeniden hesapla
    const result = await this.prisma.comment.aggregate({
      where: { expertProfileId: comment.expertProfileId, isApproved: true },
      _avg: { rating: true },
    });

    const newRating = result._avg.rating ?? 5.0;
    await this.prisma.expertProfile.update({
      where: { id: comment.expertProfileId },
      data: { rating: newRating },
    });

    return { message: 'Yorum onaylandı', newRating };
  }
}
