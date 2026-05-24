import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { FilterExpertsDto } from './dto/filter-experts.dto';
import { User } from '@prisma/client';
import { extname } from 'path';

@Injectable()
export class ExpertsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filter: FilterExpertsDto) {
    const { tags, page = 1, limit = 10 } = filter;
    const skip = (page - 1) * limit;

    const tagIds = tags ? tags.split(',').filter(Boolean) : [];

    const where = {
      status: 'YAYINDA' as const,
      ...(tagIds.length > 0 && {
        tags: { some: { id: { in: tagIds } } },
      }),
    };

    const [experts, total] = await this.prisma.$transaction([
      this.prisma.expertProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priorityScore: 'desc' }, { rating: 'desc' }],
        select: {
          id: true,
          title: true,
          avatarUrl: true,
          bio: true,
          rating: true,
          priorityScore: true,
          tags: { select: { id: true, name: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.expertProfile.count({ where }),
    ]);

    return { data: experts, total, page, limit };
  }

  async findOne(id: string) {
    const expert = await this.prisma.expertProfile.findFirst({
      where: { id, status: 'YAYINDA' },
      select: {
        id: true,
        title: true,
        avatarUrl: true,
        bio: true,
        education: true,
        rating: true,
        tags: { select: { id: true, name: true } },
        availabilities: {
          where: { isBlockedByAdmin: false },
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
        user: { select: { firstName: true, lastName: true } },
      },
    });

    if (!expert) throw new NotFoundException('Uzman bulunamadı');
    return expert;
  }

  async updateMyProfile(user: User, dto: UpdateProfileDto, avatarFile?: Express.Multer.File) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');

    const avatarUrl = avatarFile
      ? `/uploads/avatars/${avatarFile.filename}`
      : undefined;

    await this.prisma.expertProfile.update({
      where: { userId: user.id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.bio && { bio: dto.bio }),
        ...(dto.education && { education: dto.education }),
        ...(avatarUrl && { avatarUrl }),
        ...(dto.tagIds && {
          tags: {
            set: dto.tagIds.map((id) => ({ id })),
          },
        }),
        status: 'ONAY_BEKLIYOR',
      },
    });

    return { message: 'Profil güncellendi, admin onayı bekleniyor' };
  }

  async getMyProfile(userId: string) {
    const profile = await this.prisma.expertProfile.findUnique({
      where: { userId },
      include: { tags: true, availabilities: true },
    });
    if (!profile) throw new NotFoundException('Profil bulunamadı');
    return profile;
  }

  async getMyAvailabilities(userId: string) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');

    return this.prisma.availability.findMany({
      where: { expertProfileId: profile.id },
    });
  }

  async addAvailability(userId: string, dto: CreateAvailabilityDto) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');

    return this.prisma.availability.create({
      data: { ...dto, expertProfileId: profile.id },
    });
  }

  async removeAvailability(userId: string, availId: string) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');

    const avail = await this.prisma.availability.findUnique({ where: { id: availId } });
    if (!avail || avail.expertProfileId !== profile.id) throw new ForbiddenException();

    await this.prisma.availability.delete({ where: { id: availId } });
    return { message: 'Slot silindi' };
  }

  async getExpertAvailabilities(expertId: string) {
    const profile = await this.prisma.expertProfile.findFirst({
      where: { id: expertId, status: 'YAYINDA' },
    });
    if (!profile) throw new NotFoundException('Uzman bulunamadı');

    return this.prisma.availability.findMany({
      where: { expertProfileId: expertId, isBlockedByAdmin: false },
    });
  }

  async addFavorite(userId: string, expertProfileId: string) {
    const expert = await this.prisma.expertProfile.findUnique({ where: { id: expertProfileId } });
    if (!expert) throw new NotFoundException('Uzman bulunamadı');

    return this.prisma.favorite.upsert({
      where: { userId_expertProfileId: { userId, expertProfileId } },
      create: { userId, expertProfileId },
      update: {},
    });
  }

  async removeFavorite(userId: string, expertProfileId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, expertProfileId } });
    return { message: 'Favorilerden çıkarıldı' };
  }

  async getMyFavorites(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: {
        expertProfile: {
          select: { id: true, title: true, avatarUrl: true, rating: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }
}
