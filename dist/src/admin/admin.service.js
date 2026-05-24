"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
const comments_service_1 = require("../comments/comments.service");
const expert_requests_service_1 = require("../requests/expert-requests.service");
const forum_service_1 = require("../forum/forum.service");
let AdminService = class AdminService {
    prisma;
    notificationsService;
    commentsService;
    expertRequestsService;
    forumService;
    constructor(prisma, notificationsService, commentsService, expertRequestsService, forumService) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
        this.commentsService = commentsService;
        this.expertRequestsService = expertRequestsService;
        this.forumService = forumService;
    }
    async getDashboard() {
        const [pendingExperts, pendingBlogs, pendingComments, pendingQuestions, newRequests,] = await this.prisma.$transaction([
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
    async updateExpertStatus(id, dto) {
        if (dto.status === 'REDDEDILDI' && !dto.adminNote) {
            throw new common_1.BadRequestException('Red durumunda açıklama zorunludur');
        }
        const expert = await this.prisma.expertProfile.findUnique({ where: { id } });
        if (!expert)
            throw new common_1.NotFoundException('Profil bulunamadı');
        return this.prisma.expertProfile.update({
            where: { id },
            data: { status: dto.status, adminNote: dto.adminNote ?? null },
        });
    }
    async updateExpertPriority(id, priorityScore) {
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
    async updateBlogStatus(id, status, adminNote) {
        if (status === 'REDDEDILDI' && !adminNote) {
            throw new common_1.BadRequestException('Red durumunda açıklama zorunludur');
        }
        const blog = await this.prisma.blog.findUnique({ where: { id } });
        if (!blog)
            throw new common_1.NotFoundException('Blog bulunamadı');
        return this.prisma.blog.update({ where: { id }, data: { status, adminNote: adminNote ?? null } });
    }
    async getSettings() {
        return this.prisma.systemSetting.findFirst();
    }
    async updateSettings(dto) {
        const setting = await this.prisma.systemSetting.findFirst();
        if (!setting)
            throw new common_1.NotFoundException('Sistem ayarları bulunamadı');
        return this.prisma.systemSetting.update({ where: { id: setting.id }, data: dto });
    }
    async getPackages() {
        return this.prisma.package.findMany({ orderBy: { sessionCount: 'asc' } });
    }
    async updatePackage(id, dto) {
        const pkg = await this.prisma.package.findUnique({ where: { id } });
        if (!pkg)
            throw new common_1.NotFoundException('Paket bulunamadı');
        return this.prisma.package.update({ where: { id }, data: dto });
    }
    async getSss() {
        return this.prisma.sss.findMany({ orderBy: [{ page: 'asc' }, { order: 'asc' }] });
    }
    async createSss(dto) {
        return this.prisma.sss.create({ data: dto });
    }
    async updateSss(id, dto) {
        return this.prisma.sss.update({ where: { id }, data: dto });
    }
    async deleteSss(id) {
        await this.prisma.sss.delete({ where: { id } });
        return { message: 'SSS silindi' };
    }
    async sendNotification(dto) {
        return this.notificationsService.send(dto.userId, dto.type, dto.message);
    }
    async getForumQuestions(status) {
        return this.prisma.forumQuestion.findMany({
            where: status ? { status: status } : {},
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { firstName: true, lastName: true } }, expertProfile: true },
        });
    }
    async assignForumQuestion(id, expertProfileId) {
        return this.forumService.assignQuestion(id, { expertProfileId });
    }
    async approveForumQuestion(id) {
        return this.prisma.forumQuestion.update({ where: { id }, data: { status: 'ATANDI' } });
    }
    async approveForumAnswer(id) {
        return this.forumService.approveAnswer(id);
    }
    async approveComment(id) {
        return this.commentsService.approve(id);
    }
    async getRequests(page = 1, limit = 20) {
        return this.expertRequestsService.findAll(page, limit);
    }
    async updateRequestStatus(id, status) {
        return this.expertRequestsService.updateStatus(id, status);
    }
    async getExpertAvailabilities(expertId) {
        return this.prisma.availability.findMany({ where: { expertProfileId: expertId } });
    }
    async blockAvailability(id, block) {
        return this.prisma.availability.update({
            where: { id },
            data: { isBlockedByAdmin: block },
        });
    }
    async getTags() {
        return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
    }
    async createTag(name) {
        return this.prisma.tag.create({ data: { name } });
    }
    async toggleTag(id, isActive) {
        return this.prisma.tag.update({ where: { id }, data: { isActive } });
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        comments_service_1.CommentsService,
        expert_requests_service_1.ExpertRequestsService,
        forum_service_1.ForumService])
], AdminService);
//# sourceMappingURL=admin.service.js.map