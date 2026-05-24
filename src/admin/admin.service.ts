import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommentsService } from '../comments/comments.service';
import { ExpertRequestsService } from '../requests/expert-requests.service';
import { ForumService } from '../forum/forum.service';
import { UpdateExpertStatusDto } from './dto/update-expert-status.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { UpsertSssDto } from './dto/upsert-sss.dto';
import { UpsertPackageDto } from './dto/upsert-package.dto';
import { RequestStatus, ApprovalStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private commentsService: CommentsService,
    private expertRequestsService: ExpertRequestsService,
    private forumService: ForumService,
  ) {}

  async getDashboard() {
    const [
      pendingExperts,
      pendingBlogs,
      pendingComments,
      pendingQuestions,
      newRequests,
    ] = await this.prisma.$transaction([
      this.prisma.expertProfile.count({ where: { status: 'ONAY_BEKLIYOR' } }),
      this.prisma.blog.count({ where: { status: 'ONAY_BEKLIYOR' } }),
      this.prisma.comment.count({ where: { isApproved: false } }),
      this.prisma.forumQuestion.count({ where: { status: 'ONAY_BEKLIYOR' } }),
      this.prisma.expertRequest.count({ where: { status: 'BEKLEMEDE' } }),
    ]);

    return { pendingExperts, pendingBlogs, pendingComments, pendingQuestions, newRequests };
  }

  async getExperts(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expertProfile.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true, email: true } }, tags: true },
      }),
      this.prisma.expertProfile.count(),
    ]);
    return { data, total, page, limit };
  }

  async updateExpertStatus(id: string, dto: UpdateExpertStatusDto) {
    if (dto.status === 'REDDEDILDI' && !dto.adminNote) {
      throw new BadRequestException('Red durumunda açıklama zorunludur');
    }

    const expert = await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!expert) throw new NotFoundException('Profil bulunamadı');

    return this.prisma.expertProfile.update({
      where: { id },
      data: { status: dto.status, adminNote: dto.adminNote ?? null },
    });
  }

  async updateExpertPriority(id: string, priorityScore: number) {
    return this.prisma.expertProfile.update({ where: { id }, data: { priorityScore } });
  }

  async getBlogs(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.blog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { expertProfile: { select: { user: { select: { firstName: true, lastName: true } } } } },
      }),
      this.prisma.blog.count(),
    ]);
    return { data, total, page, limit };
  }

  async updateBlogStatus(id: string, status: ApprovalStatus, adminNote?: string) {
    if (status === 'REDDEDILDI' && !adminNote) {
      throw new BadRequestException('Red durumunda açıklama zorunludur');
    }
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    return this.prisma.blog.update({ where: { id }, data: { status, adminNote: adminNote ?? null } });
  }

  async getSettings() {
    return this.prisma.systemSetting.findFirst();
  }

  async updateSettings(dto: UpdateSystemSettingsDto) {
    const setting = await this.prisma.systemSetting.findFirst();
    if (!setting) throw new NotFoundException('Sistem ayarları bulunamadı');
    return this.prisma.systemSetting.update({ where: { id: setting.id }, data: dto });
  }

  async getPackages() {
    return this.prisma.package.findMany({ orderBy: { sessionCount: 'asc' } });
  }

  async updatePackage(id: string, dto: UpsertPackageDto) {
    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('Paket bulunamadı');
    return this.prisma.package.update({ where: { id }, data: dto });
  }

  async getSss() {
    return this.prisma.sss.findMany({ orderBy: [{ page: 'asc' }, { order: 'asc' }] });
  }

  async createSss(dto: UpsertSssDto) {
    return this.prisma.sss.create({ data: dto });
  }

  async updateSss(id: string, dto: UpsertSssDto) {
    return this.prisma.sss.update({ where: { id }, data: dto });
  }

  async deleteSss(id: string) {
    await this.prisma.sss.delete({ where: { id } });
    return { message: 'SSS silindi' };
  }

  async sendNotification(dto: SendNotificationDto) {
    return this.notificationsService.send(dto.userId, dto.type, dto.message);
  }

  async getForumQuestions(status?: string) {
    return this.prisma.forumQuestion.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } }, expertProfile: true },
    });
  }

  async assignForumQuestion(id: string, expertProfileId: string) {
    return this.forumService.assignQuestion(id, { expertProfileId });
  }

  async approveForumQuestion(id: string) {
    return this.prisma.forumQuestion.update({ where: { id }, data: { status: 'ATANDI' } });
  }

  async approveForumAnswer(id: string) {
    return this.forumService.approveAnswer(id);
  }

  async approveComment(id: string) {
    return this.commentsService.approve(id);
  }

  async getRequests(page = 1, limit = 20) {
    return this.expertRequestsService.findAll(page, limit);
  }

  async updateRequestStatus(id: string, status: RequestStatus) {
    return this.expertRequestsService.updateStatus(id, status);
  }

  async getExpertAvailabilities(expertId: string) {
    return this.prisma.availability.findMany({ where: { expertProfileId: expertId } });
  }

  async blockAvailability(id: string, block: boolean) {
    return this.prisma.availability.update({
      where: { id },
      data: { isBlockedByAdmin: block },
    });
  }

  async getTags() {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async createTag(name: string) {
    return this.prisma.tag.create({ data: { name } });
  }

  async toggleTag(id: string, isActive: boolean) {
    return this.prisma.tag.update({ where: { id }, data: { isActive } });
  }
}
