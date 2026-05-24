import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { AssignQuestionDto } from './dto/assign-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { User } from '@prisma/client';

@Injectable()
export class ForumService {
  constructor(private prisma: PrismaService) {}

  async createQuestion(user: User, dto: CreateQuestionDto) {
    return this.prisma.forumQuestion.create({
      data: { ...dto, userId: user.id, status: 'ONAY_BEKLIYOR' },
    });
  }

  async findAllPublic(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.forumQuestion.findMany({
        where: { status: 'CEVAPLANDI' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          answers: { where: { isApproved: true }, select: { content: true, createdAt: true, expertProfile: { select: { title: true, user: { select: { firstName: true, lastName: true } } } } } },
        },
      }),
      this.prisma.forumQuestion.count({ where: { status: 'CEVAPLANDI' } }),
    ]);
    return { data, total, page, limit };
  }

  async findOnePublic(id: string) {
    const q = await this.prisma.forumQuestion.findFirst({
      where: { id, status: 'CEVAPLANDI' },
      include: {
        answers: { where: { isApproved: true } },
      },
    });
    if (!q) throw new NotFoundException('Soru bulunamadı');
    return q;
  }

  async assignQuestion(id: string, dto: AssignQuestionDto) {
    const q = await this.prisma.forumQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Soru bulunamadı');

    return this.prisma.forumQuestion.update({
      where: { id },
      data: { expertProfileId: dto.expertProfileId, status: 'ATANDI' },
    });
  }

  async approveQuestion(id: string, approved: boolean) {
    const q = await this.prisma.forumQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Soru bulunamadı');

    return this.prisma.forumQuestion.update({
      where: { id },
      data: { status: approved ? 'ATANDI' : 'ONAY_BEKLIYOR' },
    });
  }

  async getAssignedQuestions(userId: string) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');

    return this.prisma.forumQuestion.findMany({
      where: { expertProfileId: profile.id, status: { in: ['ATANDI', 'CEVAPLANDI'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAnswer(userId: string, questionId: string, dto: CreateAnswerDto) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Uzman profili bulunamadı');

    const q = await this.prisma.forumQuestion.findFirst({
      where: { id: questionId, expertProfileId: profile.id },
    });
    if (!q) throw new ForbiddenException('Bu soru size atanmamış');

    const answer = await this.prisma.forumAnswer.create({
      data: { questionId, expertProfileId: profile.id, content: dto.content },
    });

    await this.prisma.forumQuestion.update({
      where: { id: questionId },
      data: { status: 'CEVAPLANDI' },
    });

    return answer;
  }

  async approveAnswer(id: string) {
    const answer = await this.prisma.forumAnswer.findUnique({ where: { id } });
    if (!answer) throw new NotFoundException('Cevap bulunamadı');
    return this.prisma.forumAnswer.update({ where: { id }, data: { isApproved: true } });
  }
}
