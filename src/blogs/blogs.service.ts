import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { User } from '@prisma/client';

@Injectable()
export class BlogsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async findAllPublic(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.blog.findMany({
        where: { status: 'YAYINDA' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, slug: true, content: true, coverImageUrl: true, authorName: true, createdAt: true, expertProfile: { select: { title: true, user: { select: { firstName: true, lastName: true } } } } },
      }),
      this.prisma.blog.count({ where: { status: 'YAYINDA' } }),
    ]);
    return { data, total, page, limit };
  }

  async findBySlug(slug: string) {
    const blog = await this.prisma.blog.findFirst({
      where: { slug, status: 'YAYINDA' },
      include: { expertProfile: { select: { id: true, title: true, avatarUrl: true, user: { select: { firstName: true, lastName: true } } } } },
    });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    return blog;
  }

  async create(user: User, dto: CreateBlogDto) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new ForbiddenException('Uzman profili bulunamadı');

    return this.prisma.blog.create({
      data: {
        ...dto,
        expertProfileId: profile.id,
        authorName: `${user.firstName} ${user.lastName}`.trim(),
        status: 'TASLAK',
      },
    });
  }

  async update(user: User, id: string, dto: Partial<CreateBlogDto>) {
    const blog = await this.prisma.blog.findUnique({ where: { id }, include: { expertProfile: true } });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    if (blog.authorName === 'Editör') throw new ForbiddenException('Admin tarafından oluşturulan bloglar düzenlenemez');
    if (!blog.expertProfile || blog.expertProfile.userId !== user.id) throw new ForbiddenException();

    // Yayındaki blog: değişiklikler pending'e gider, eski içerik yayında kalır
    if (blog.status === 'YAYINDA') {
      return this.prisma.blog.update({
        where: { id },
        data: {
          pendingTitle: dto.title ?? blog.pendingTitle,
          pendingContent: dto.content ?? blog.pendingContent,
          status: 'REVIZE_GONDERILDI',
        },
      });
    }

    // Taslak veya reddedildi → direkt güncelle
    const newStatus = blog.status === 'REDDEDILDI' ? 'REVIZE_GONDERILDI' : 'ONAY_BEKLIYOR';
    return this.prisma.blog.update({
      where: { id },
      data: { ...dto, status: newStatus },
    });
  }

  async delete(user: User, id: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id }, include: { expertProfile: true } });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    if (blog.authorName === 'Editör') throw new ForbiddenException('Admin tarafından oluşturulan bloglar silinemez');
    if (!blog.expertProfile || blog.expertProfile.userId !== user.id) throw new ForbiddenException();

    await this.prisma.blog.delete({ where: { id } });
    return { message: 'Blog silindi' };
  }

  async getMyBlogs(userId: string) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');
    return this.prisma.blog.findMany({
      where: { expertProfileId: profile.id, NOT: { authorName: 'Editör' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadCover(user: User, id: string, file: Express.Multer.File): Promise<{ coverImageUrl: string }> {
    const blog = await this.prisma.blog.findUnique({ where: { id }, include: { expertProfile: true } });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    if (blog.authorName === 'Editör') throw new ForbiddenException('Admin tarafından oluşturulan bloglar düzenlenemez');
    if (!blog.expertProfile || blog.expertProfile.userId !== user.id) throw new ForbiddenException();

    const url = await this.storage.upload('blog-covers', file, user.id);

    if (blog.status === 'YAYINDA') {
      // Yayındaki blog: kapak da pending'e gider
      if (blog.pendingCoverImageUrl) await this.storage.deleteByUrl(blog.pendingCoverImageUrl);
      await this.prisma.blog.update({ where: { id }, data: { pendingCoverImageUrl: url, status: 'REVIZE_GONDERILDI' } });
    } else {
      if (blog.coverImageUrl) await this.storage.deleteByUrl(blog.coverImageUrl);
      await this.prisma.blog.update({ where: { id }, data: { coverImageUrl: url } });
    }

    return { coverImageUrl: url };
  }
}
