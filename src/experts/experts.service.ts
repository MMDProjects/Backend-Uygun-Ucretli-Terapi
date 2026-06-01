import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { FilterExpertsDto } from './dto/filter-experts.dto';
import { User } from '@prisma/client';

@Injectable()
export class ExpertsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async findAll(filter: FilterExpertsDto) {
    const { tags, page = 1, limit = 10 } = filter;
    const skip = (page - 1) * limit;

    const tagIds = tags ? tags.split(',').filter(Boolean) : [];

    const where = {
      status: 'YAYINDA' as const,
      isPublished: true,
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
          standardPrice: true,
          discountedPrice: true,
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
      where: { id, status: 'YAYINDA', isPublished: true },
      select: {
        id: true,
        title: true,
        avatarUrl: true,
        cvUrl: true,
        certificateUrl: true,
        bio: true,
        education: true,
        rating: true,
        standardPrice: true,
        discountedPrice: true,
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

  async updateMyProfile(
    user: User,
    dto: UpdateProfileDto,
    avatarFile?: Express.Multer.File,
    certificateFile?: Express.Multer.File,
    cvFile?: Express.Multer.File,
  ) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');

    // Direkt güncellenen alanlar (admin onayı gerekmez): avatar, tags
    const directUpdate: Record<string, unknown> = {};
    if (avatarFile) {
      if (profile.avatarUrl) await this.storage.deleteByUrl(profile.avatarUrl);
      directUpdate.avatarUrl = await this.storage.upload('avatars', avatarFile, user.id);
    }
    if (dto.tagIds) directUpdate.tags = { set: dto.tagIds.map((id) => ({ id })) };

    // Admin onayına giden alanlar: bio, title, education, certificateUrl, cvUrl
    const reviewUpdate: Record<string, unknown> = {};
    if (dto.bio !== undefined) reviewUpdate.pendingBio = dto.bio;
    if (dto.title !== undefined) reviewUpdate.pendingTitle = dto.title;
    if (dto.education !== undefined) reviewUpdate.pendingEducation = dto.education;
    if (certificateFile) reviewUpdate.pendingCertificateUrl = await this.storage.upload('certificates', certificateFile, user.id);
    if (cvFile) reviewUpdate.pendingCvUrl = await this.storage.upload('cvs', cvFile, user.id);

    const needsReview = Object.keys(reviewUpdate).length > 0;

    if (needsReview) {
      await this.prisma.expertProfile.update({
        where: { userId: user.id },
        data: {
          ...directUpdate,
          ...reviewUpdate,
          status: 'REVIZE_GONDERILDI',
          // isPublished kasıtlı olarak değiştirilmiyor — yayındaki eski içerik görünmeye devam eder
        },
      });
      return { message: 'Biyografi/belge değişikliği admin onayına gönderildi. Onaylanana kadar mevcut profiliniz yayında kalmaya devam eder.' };
    }

    if (Object.keys(directUpdate).length > 0) {
      await this.prisma.expertProfile.update({
        where: { userId: user.id },
        data: directUpdate,
      });
    }

    return { message: 'Profil güncellendi' };
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

  async getMySentRequests(userId: string) {
    return this.prisma.expertRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        expertProfile: {
          select: {
            id: true,
            title: true,
            avatarUrl: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  async getTags() {
    return this.prisma.tag.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async getExpertBlogs(expertProfileId: string) {
    const profile = await this.prisma.expertProfile.findFirst({
      where: { id: expertProfileId, status: 'YAYINDA' },
    });
    if (!profile) throw new NotFoundException('Uzman bulunamadı');

    return this.prisma.blog.findMany({
      where: { expertProfileId, status: 'YAYINDA' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, title: true, content: true, createdAt: true },
    });
  }
}
