import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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
    // Sadece en az 1 onaylı cevabı olan sorular public listede görünür
    const where = { status: 'CEVAPLANDI' as const, answers: { some: { isApproved: true } } };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.forumQuestion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          answers: { where: { isApproved: true }, select: { content: true, createdAt: true, expertProfile: { select: { title: true, avatarUrl: true, user: { select: { firstName: true, lastName: true } } } } } },
        },
      }),
      this.prisma.forumQuestion.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOnePublic(id: string) {
    const q = await this.prisma.forumQuestion.findFirst({
      where: { id, status: 'CEVAPLANDI' },
      include: {
        answers: { where: { isApproved: true }, include: { expertProfile: { select: { title: true, avatarUrl: true, user: { select: { firstName: true, lastName: true } } } } } },
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

  async getAssignedQuestionById(userId: string, questionId: string) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException('Uzman profili bulunamadı');

    const q = await this.prisma.forumQuestion.findFirst({
      where: { id: questionId, expertProfileId: profile.id },
      include: {
        answers: {
          include: {
            expertProfile: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!q) throw new NotFoundException('Soru bulunamadı veya size atanmamış');
    return q;
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

  async getMyQuestions(userId: string) {
    return this.prisma.forumQuestion.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, content: true, status: true, createdAt: true },
    });
  }

  async getMyQuestionById(userId: string, questionId: string) {
    const q = await this.prisma.forumQuestion.findFirst({
      where: { id: questionId, userId },
      include: {
        answers: {
          include: {
            expertProfile: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!q) throw new NotFoundException('Soru bulunamadı');
    return q;
  }

  async deleteQuestion(userId: string, questionId: string) {
    const q = await this.prisma.forumQuestion.findUnique({ where: { id: questionId } });
    if (!q) throw new NotFoundException('Soru bulunamadı');
    if (q.userId !== userId) throw new ForbiddenException('Bu soruyu silemezsiniz');
    if (q.status !== 'ONAY_BEKLIYOR') throw new BadRequestException('Sadece onay bekleyen sorular silinebilir');
    await this.prisma.forumQuestion.delete({ where: { id: questionId } });
  }

  async adminDeleteQuestion(questionId: string) {
    const q = await this.prisma.forumQuestion.findUnique({ where: { id: questionId } });
    if (!q) throw new NotFoundException('Soru bulunamadı');
    await this.prisma.forumQuestion.delete({ where: { id: questionId } });
  }

  async approveAnswer(id: string) {
    const answer = await this.prisma.forumAnswer.findUnique({ where: { id } });
    if (!answer) throw new NotFoundException('Cevap bulunamadı');
    return this.prisma.forumAnswer.update({ where: { id }, data: { isApproved: true } });
  }
}
