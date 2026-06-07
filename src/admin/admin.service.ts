import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { CommentsService } from '../comments/comments.service';
import { ExpertRequestsService } from '../requests/expert-requests.service';
import { ForumService } from '../forum/forum.service';
import { UpdateExpertStatusDto } from './dto/update-expert-status.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { UpsertSssDto } from './dto/upsert-sss.dto';
import { UpsertPackageDto } from './dto/upsert-package.dto';
import { RequestStatus, ApprovalStatus } from '@prisma/client';

const DEFAULT_SLOTS = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
  { dayOfWeek: day, startTime: '09:00', endTime: '12:00' },
  { dayOfWeek: day, startTime: '12:00', endTime: '17:00' },
  { dayOfWeek: day, startTime: '17:00', endTime: '21:00' },
]);

const DEFAULT_ANNOUNCEMENT_ITEMS = [
  'Admin onaylı, sertifikalı uzman profilleri',
  'Ücretsiz ön görüşme imkânı — WhatsApp üzerinden hemen başla',
  'KVKK uyumlu, güvenli ve gizli platformdur',
  'Her uzman belgelerini danışanlarıyla şeffaf paylaşır',
];

const DEFAULT_WHEEL_SEGMENTS = [
  { label: 'Ön Görüş.', description: 'Ücretsiz ön görüşme hakkı — 20 dk WhatsApp görüşmesi' },
  { label: '%10 İnd.', description: 'İlk seansta %10 indirim fırsatı' },
  { label: 'Tekrar!', description: 'Bu sefer olmadı — bir daha dene!' },
  { label: 'Bedava!', description: 'Ücretsiz ilk seans hakkı kazandın' },
  { label: '%20 İnd.', description: 'İlk seansta %20 indirim fırsatı' },
  { label: 'Sürpriz!', description: 'Özel sürpriz ödül — WhatsApp\'tan talep et' },
];

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notificationsService: NotificationsService,
    private mail: MailService,
    private commentsService: CommentsService,
    private expertRequestsService: ExpertRequestsService,
    private forumService: ForumService,
  ) {}

  async getDashboard() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      pendingExperts,
      pendingBlogs,
      pendingComments,
      pendingQuestions,
      newRequests,
      pendingForumAnswers,
      newTestResults,
    ] = await this.prisma.$transaction([
      this.prisma.expertProfile.count({ where: { status: 'ONAY_BEKLIYOR' } }),
      this.prisma.blog.count({ where: { status: 'ONAY_BEKLIYOR' } }),
      this.prisma.comment.count({ where: { isApproved: false } }),
      this.prisma.forumQuestion.count({ where: { status: 'ONAY_BEKLIYOR' } }),
      this.prisma.expertRequest.count({ where: { status: 'BEKLEMEDE' } }),
      this.prisma.forumAnswer.count({ where: { isApproved: false } }),
      this.prisma.testResult.count({ where: { createdAt: { gte: since24h } } }),
    ]);

    return {
      pendingExperts,
      pendingBlogs,
      pendingComments,
      pendingQuestions,
      newRequests,
      pendingForumAnswers,
      newTestResults,
    };
  }

  async getExperts(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expertProfile.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true, isActive: true } },
          tags: true,
        },
      }),
      this.prisma.expertProfile.count(),
    ]);
    return { data, total, page, limit };
  }

  async getExpertById(id: string) {
    const expert = await this.prisma.expertProfile.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true, isActive: true } },
        tags: true,
      },
    });
    if (!expert) throw new NotFoundException('Uzman bulunamadı');
    return expert;
  }

  async updateExpertStatus(id: string, dto: UpdateExpertStatusDto) {
    if (dto.status === 'REDDEDILDI' && !dto.adminNote) {
      throw new BadRequestException('Red durumunda açıklama zorunludur');
    }

    const expert = await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!expert) throw new NotFoundException('Profil bulunamadı');

    const data: Record<string, unknown> = {
      status: dto.status,
      adminNote: dto.adminNote ?? null,
    };

    if (dto.status === 'YAYINDA') {
      data.isPublished = true;
      const isRevision = !!(expert.pendingBio || expert.pendingTitle || expert.pendingEducation || expert.pendingCertificateUrl || expert.pendingCvUrl);
      if (expert.pendingBio) { data.bio = expert.pendingBio; data.pendingBio = null; }
      if (expert.pendingTitle) { data.title = expert.pendingTitle; data.pendingTitle = null; }
      if (expert.pendingEducation) { data.education = expert.pendingEducation; data.pendingEducation = null; }
      if (expert.pendingCertificateUrl) {
        if (expert.certificateUrl) await this.storage.deleteByUrl(expert.certificateUrl);
        data.certificateUrl = expert.pendingCertificateUrl;
        data.pendingCertificateUrl = null;
      }
      if (expert.pendingCvUrl) {
        if (expert.cvUrl) await this.storage.deleteByUrl(expert.cvUrl);
        data.cvUrl = expert.pendingCvUrl;
        data.pendingCvUrl = null;
      }
      await this.createDefaultAvailabilitiesIfEmpty(id);
      await this.notificationsService.send(
        expert.userId,
        'INFO',
        isRevision
          ? 'Profil güncellemeniz onaylandı ve yayına alındı.'
          : 'Profiliniz onaylandı ve yayına alındı. Artık danışanlar tarafından görünüyorsunuz.',
      );
      // Mail (SSE'ye ek)
      const approvedUser = await this.prisma.user.findUnique({ where: { id: expert.userId }, select: { email: true, firstName: true } });
      if (approvedUser) this.mail.sendExpertProfileApproved(approvedUser.email, approvedUser.firstName).catch(() => {});
    }

    if (dto.status === 'REDDEDILDI') {
      if (expert.pendingCertificateUrl) await this.storage.deleteByUrl(expert.pendingCertificateUrl);
      if (expert.pendingCvUrl) await this.storage.deleteByUrl(expert.pendingCvUrl);
      data.pendingBio = null;
      data.pendingTitle = null;
      data.pendingEducation = null;
      data.pendingCertificateUrl = null;
      data.pendingCvUrl = null;
      await this.notificationsService.send(
        expert.userId,
        'WARNING',
        `Profiliniz reddedildi. Admin notu: ${dto.adminNote}`,
      );
      // Mail (SSE'ye ek)
      const rejectedUser = await this.prisma.user.findUnique({ where: { id: expert.userId }, select: { email: true, firstName: true } });
      if (rejectedUser) this.mail.sendExpertProfileRejected(rejectedUser.email, rejectedUser.firstName, dto.adminNote ?? '').catch(() => {});
    }

    return this.prisma.expertProfile.update({ where: { id }, data });
  }

  async createDefaultAvailabilitiesIfEmpty(expertProfileId: string) {
    const existing = await this.prisma.availability.count({ where: { expertProfileId } });
    if (existing > 0) return;
    await this.prisma.availability.createMany({
      data: DEFAULT_SLOTS.map((s) => ({ expertProfileId, ...s })),
      skipDuplicates: true,
    });
  }

  async updateExpertPriority(id: string, priorityScore: number) {
    return this.prisma.expertProfile.update({ where: { id }, data: { priorityScore } });
  }

  async updateExpertPricing(id: string, standardPrice: number | null, discountedPrice: number | null) {
    const expert = await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!expert) throw new NotFoundException('Uzman bulunamadı');
    return this.prisma.expertProfile.update({
      where: { id },
      data: { standardPrice, discountedPrice },
    });
  }

  async toggleExpertActive(id: string, isActive: boolean) {
    const expert = await this.prisma.expertProfile.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!expert) throw new NotFoundException('Uzman bulunamadı');
    return this.prisma.user.update({
      where: { id: expert.userId },
      data: { isActive },
    });
  }

  async toggleExpertPublish(id: string, isPublished: boolean) {
    const expert = await this.prisma.expertProfile.findUnique({ where: { id } });
    if (!expert) throw new NotFoundException('Profil bulunamadı');
    if (isPublished && expert.status !== 'YAYINDA') {
      throw new BadRequestException('Yalnızca YAYINDA statüsündeki uzmanlar yayına alınabilir');
    }
    return this.prisma.expertProfile.update({ where: { id }, data: { isPublished } });
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

  async createAdminBlog(dto: { title: string; slug: string; content: string; authorName: string; coverImageUrl?: string }) {
    // Admin blogları için sistem uzman profilini bul (öncelikli: en yüksek priorityScore)
    const profile = await this.prisma.expertProfile.findFirst({
      orderBy: { priorityScore: 'desc' },
    });
    if (!profile) throw new BadRequestException('Blog yazabilmek için sistemde en az bir uzman profili olmalıdır.');

    return this.prisma.blog.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        content: dto.content,
        authorName: dto.authorName,
        coverImageUrl: dto.coverImageUrl ?? null,
        status: 'YAYINDA',
        expertProfileId: profile.id,
      },
    });
  }

  async updateBlogContent(id: string, dto: { title?: string; slug?: string; content?: string }) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    return this.prisma.blog.update({ where: { id }, data: dto });
  }

  async deleteBlog(id: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id } });
    if (!blog) throw new NotFoundException('Blog bulunamadı');
    return this.prisma.blog.delete({ where: { id } });
  }

  async updateBlogStatus(id: string, status: ApprovalStatus, adminNote?: string) {
    if (status === 'REDDEDILDI' && !adminNote) {
      throw new BadRequestException('Red durumunda açıklama zorunludur');
    }
    const blog = await this.prisma.blog.findUnique({
      where: { id },
      include: { expertProfile: { select: { userId: true } } },
    });
    if (!blog) throw new NotFoundException('Blog bulunamadı');

    const updateData: Record<string, unknown> = { status, adminNote: adminNote ?? null };

    if (status === 'YAYINDA') {
      // Revize onaylandıysa pending içeriği ana alanlara taşı
      if (blog.pendingTitle) { updateData.title = blog.pendingTitle; updateData.pendingTitle = null; }
      if (blog.pendingContent) { updateData.content = blog.pendingContent; updateData.pendingContent = null; }
      if (blog.pendingCoverImageUrl) {
        if (blog.coverImageUrl) await this.storage.deleteByUrl(blog.coverImageUrl);
        updateData.coverImageUrl = blog.pendingCoverImageUrl;
        updateData.pendingCoverImageUrl = null;
      }
    }

    if (status === 'REDDEDILDI') {
      // Reddedilince pending'leri temizle
      updateData.pendingTitle = null;
      updateData.pendingContent = null;
      updateData.pendingCoverImageUrl = null;
    }

    await this.prisma.blog.update({ where: { id }, data: updateData });

    if (status === 'YAYINDA') {
      await this.notificationsService.send(
        blog.expertProfile.userId,
        'INFO',
        `"${blog.title}" başlıklı blog yazınız onaylandı ve yayına alındı.`,
      );
      const u = await this.prisma.user.findUnique({ where: { id: blog.expertProfile.userId }, select: { email: true, firstName: true } });
      if (u) this.mail.sendBlogApproved(u.email, u.firstName, blog.title).catch(() => {});
    }
    if (status === 'REDDEDILDI') {
      await this.notificationsService.send(
        blog.expertProfile.userId,
        'WARNING',
        `"${blog.title}" başlıklı blog yazınız reddedildi. Admin notu: ${adminNote}`,
      );
      const u = await this.prisma.user.findUnique({ where: { id: blog.expertProfile.userId }, select: { email: true, firstName: true } });
      if (u) this.mail.sendBlogRejected(u.email, u.firstName, blog.title, adminNote ?? '').catch(() => {});
    }

    return blog;
  }

  async getSettings() {
    const s = await this.prisma.systemSetting.findFirst();
    if (!s) {
      return this.prisma.systemSetting.create({
        data: {
          whatsappNumber: '+905000000000',
          instagramUrl: 'https://instagram.com/psikodanismanlik',
          standardPrice: 1500,
          discountedPrice: 1000,
          logoUrl: '/uploads/logo.png',
          announcementItems: DEFAULT_ANNOUNCEMENT_ITEMS,
          wheelSegments: DEFAULT_WHEEL_SEGMENTS,
        },
      });
    }

    // wheelSegments boş/null ise default'ları DB'ye yaz ve dön
    const segments = s.wheelSegments as { label: string; description: string }[] | null;
    if (!segments || (Array.isArray(segments) && segments.length < 2)) {
      return this.prisma.systemSetting.update({
        where: { id: s.id },
        data: { wheelSegments: DEFAULT_WHEEL_SEGMENTS },
      });
    }

    return s;
  }

  async updateSettings(dto: UpdateSystemSettingsDto) {
    const setting = await this.prisma.systemSetting.findFirst();
    if (setting) {
      // Sadece gönderilen alanları güncelle — undefined alanlar mevcut değeri korumalı
      const patch: Record<string, unknown> = {};
      if (dto.whatsappNumber !== undefined) patch.whatsappNumber = dto.whatsappNumber;
      if (dto.instagramUrl !== undefined) patch.instagramUrl = dto.instagramUrl;
      if (dto.standardPrice !== undefined) patch.standardPrice = dto.standardPrice;
      if (dto.discountedPrice !== undefined) patch.discountedPrice = dto.discountedPrice;
      if (dto.logoUrl !== undefined) patch.logoUrl = dto.logoUrl;
      if (dto.videoUrl !== undefined) patch.videoUrl = dto.videoUrl;
      if (dto.announcementItems !== undefined) patch.announcementItems = dto.announcementItems;
      if (dto.wheelSegments !== undefined) patch.wheelSegments = dto.wheelSegments;
      return this.prisma.systemSetting.update({ where: { id: setting.id }, data: patch });
    }
    return this.prisma.systemSetting.create({
      data: {
        whatsappNumber: dto.whatsappNumber ?? '+905000000000',
        instagramUrl: dto.instagramUrl ?? 'https://instagram.com/psikodanismanlik',
        standardPrice: dto.standardPrice ?? 1500,
        discountedPrice: dto.discountedPrice ?? 1000,
        logoUrl: dto.logoUrl ?? '/uploads/logo.png',
        announcementItems: dto.announcementItems ?? DEFAULT_ANNOUNCEMENT_ITEMS,
        wheelSegments: dto.wheelSegments ?? DEFAULT_WHEEL_SEGMENTS,
      },
    });
  }

  async getPackages() {
    return this.prisma.package.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
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
    const result = await this.notificationsService.send(dto.userId, dto.type, dto.message);
    // R18: admin uyarısında email de gönder
    const u = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { email: true, firstName: true } });
    if (u) this.mail.sendAdminWarningToExpert(u.email, u.firstName, dto.message).catch(() => {});
    return result;
  }

  async getForumQuestions(status?: string) {
    return this.prisma.forumQuestion.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        expertProfile: { include: { user: { select: { firstName: true, lastName: true } } } },
        answers: {
          include: { expertProfile: { include: { user: { select: { firstName: true, lastName: true } } } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async assignForumQuestion(id: string, expertProfileId: string) {
    const result = await this.forumService.assignQuestion(id, { expertProfileId });

    const [expertProfile, question] = await Promise.all([
      this.prisma.expertProfile.findUnique({ where: { id: expertProfileId }, select: { userId: true } }),
      this.prisma.forumQuestion.findUnique({ where: { id }, select: { title: true } }),
    ]);

    if (expertProfile && question) {
      await this.notificationsService.send(
        expertProfile.userId,
        'INFO',
        `Yeni bir forum sorusu size atandı: "${question.title}"`,
      );
    }

    return result;
  }

  async approveForumQuestion(id: string) {
    return this.prisma.forumQuestion.update({ where: { id }, data: { status: 'ATANDI' } });
  }

  async approveForumAnswer(id: string) {
    const answer = await this.prisma.forumAnswer.findUnique({
      where: { id },
      include: {
        expertProfile: { select: { userId: true } },
        question: { select: { title: true } },
      },
    });
    const result = await this.forumService.approveAnswer(id);
    if (answer?.expertProfile?.userId) {
      this.notificationsService.send(
        answer.expertProfile.userId,
        'INFO',
        `Forum cevabınız onaylandı: "${answer.question?.title ?? ''}"`,
      ).catch(() => {});
    }
    return result;
  }

  async approveComment(id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      include: { expertProfile: { select: { userId: true } } },
    });
    const result = await this.commentsService.approve(id);
    if (comment?.expertProfile?.userId) {
      this.notificationsService.send(
        comment.expertProfile.userId,
        'INFO',
        'Profilinize yeni bir yorum onaylandı ve yayına alındı.',
      ).catch(() => {});
    }
    return result;
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

  async bulkBlockAvailabilities(ids: string[], block: boolean) {
    await this.prisma.availability.updateMany({
      where: { id: { in: ids } },
      data: { isBlockedByAdmin: block },
    });
    return { updated: ids.length, block };
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

  async deleteTag(id: string) {
    // Önce tüm uzman profillerinden bu tag'ı kaldır, sonra sil
    await this.prisma.tag.update({
      where: { id },
      data: { profiles: { set: [] } },
    });
    return this.prisma.tag.delete({ where: { id } });
  }

  async getUsers(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          role: 'DANISAN' as const,
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : { role: 'DANISAN' as const };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async getContactForms(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.contactForm.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contactForm.count(),
    ]);
    return { data, total, page, limit };
  }

  async updateContactFormStatus(id: string, status: string) {
    const validStatuses = ['YENI', 'ISLEMDE', 'COZULDU'];
    if (!validStatuses.includes(status)) throw new Error(`Geçersiz status: ${status}`);
    return this.prisma.contactForm.update({
      where: { id },
      data: { status: status as any },
    });
  }

  // ─── Test Yönetimi ────────────────────────────────────────────────────────

  async getAdminTests() {
    return this.prisma.test.findMany({ orderBy: { title: 'asc' } });
  }

  async createTest(dto: { title: string; slug: string; description: string; isActive?: boolean; definition?: Record<string, unknown> }) {
    return this.prisma.test.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description,
        isActive: dto.isActive ?? true,
        ...(dto.definition !== undefined && { definition: dto.definition as any }),
      },
    });
  }

  async updateTest(id: string, dto: { title: string; slug: string; description: string; isActive?: boolean; definition?: Record<string, unknown> }) {
    const test = await this.prisma.test.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('Test bulunamadı');
    return this.prisma.test.update({
      where: { id },
      data: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description,
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.definition !== undefined && { definition: dto.definition as any }),
      },
    });
  }

  async deleteTest(id: string) {
    const test = await this.prisma.test.findUnique({ where: { id } });
    if (!test) throw new NotFoundException('Test bulunamadı');
    return this.prisma.test.delete({ where: { id } });
  }

  async getAdminTestResults(page = 1, limit = 20, testId?: string, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (testId) where.testId = testId;
    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.testResult.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          test: { select: { title: true, slug: true } },
        },
      }),
      this.prisma.testResult.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
