import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { User } from '@prisma/client';

@Injectable()
export class BlogsService {
  constructor(private prisma: PrismaService) {}

  async findAllPublic(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.blog.findMany({
        where: { status: 'YAYINDA' },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, slug: true, createdAt: true, expertProfile: { select: { title: true, user: { select: { firstName: true, lastName: true } } } } },
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
      data: { ...dto, expertProfileId: profile.id, status: 'TASLAK' },
    });
  }

  async update(user: User, id: string, dto: Partial<CreateBlogDto>) {
    const blog = await this.prisma.blog.findUnique({ where: { id }, include: { expertProfile: true } });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    if (blog.expertProfile.userId !== user.id) throw new ForbiddenException();

    return this.prisma.blog.update({
      where: { id },
      data: { ...dto, status: 'ONAY_BEKLIYOR' },
    });
  }

  async delete(user: User, id: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id }, include: { expertProfile: true } });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    if (blog.expertProfile.userId !== user.id) throw new ForbiddenException();

    await this.prisma.blog.delete({ where: { id } });
    return { message: 'Blog silindi' };
  }

  async getMyBlogs(userId: string) {
    const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profil bulunamadı');
    return this.prisma.blog.findMany({ where: { expertProfileId: profile.id }, orderBy: { createdAt: 'desc' } });
  }
}
