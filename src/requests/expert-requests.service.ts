import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { User, RequestStatus } from '@prisma/client';

@Injectable()
export class ExpertRequestsService {
  constructor(private prisma: PrismaService) {}

  async create(user: User, expertProfileId: string, dto: CreateRequestDto) {
    const expert = await this.prisma.expertProfile.findUnique({ where: { id: expertProfileId } });
    if (!expert) throw new NotFoundException('Uzman bulunamadı');

    return this.prisma.expertRequest.create({
      data: { userId: user.id, expertProfileId, message: dto.message },
    });
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expertRequest.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true } },
          expertProfile: { select: { title: true, user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.expertRequest.count(),
    ]);
    return { data, total, page, limit };
  }

  async updateStatus(id: string, status: RequestStatus) {
    const req = await this.prisma.expertRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Talep bulunamadı');
    return this.prisma.expertRequest.update({ where: { id }, data: { status } });
  }

  async getMyRequests(userId: string) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');

    return this.prisma.expertRequest.findMany({
      where: { expertProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  async updateMyRequestStatus(userId: string, requestId: string, status: RequestStatus) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');

    const req = await this.prisma.expertRequest.findUnique({ where: { id: requestId } });
    if (!req || req.expertProfileId !== profile.id) throw new ForbiddenException();

    return this.prisma.expertRequest.update({ where: { id: requestId }, data: { status } });
  }
}
