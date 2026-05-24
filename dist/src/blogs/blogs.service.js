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
exports.BlogsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let BlogsService = class BlogsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
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
    async findBySlug(slug) {
        const blog = await this.prisma.blog.findFirst({
            where: { slug, status: 'YAYINDA' },
            include: { expertProfile: { select: { id: true, title: true, avatarUrl: true, user: { select: { firstName: true, lastName: true } } } } },
        });
        if (!blog)
            throw new common_1.NotFoundException('Blog bulunamadı');
        return blog;
    }
    async create(user, dto) {
        const profile = await this.prisma.expertProfile.findUnique({ where: { userId: user.id } });
        if (!profile)
            throw new common_1.ForbiddenException('Uzman profili bulunamadı');
        return this.prisma.blog.create({
            data: { ...dto, expertProfileId: profile.id, status: 'TASLAK' },
        });
    }
    async update(user, id, dto) {
        const blog = await this.prisma.blog.findUnique({ where: { id }, include: { expertProfile: true } });
        if (!blog)
            throw new common_1.NotFoundException('Blog bulunamadı');
        if (blog.expertProfile.userId !== user.id)
            throw new common_1.ForbiddenException();
        return this.prisma.blog.update({
            where: { id },
            data: { ...dto, status: 'ONAY_BEKLIYOR' },
        });
    }
    async delete(user, id) {
        const blog = await this.prisma.blog.findUnique({ where: { id }, include: { expertProfile: true } });
        if (!blog)
            throw new common_1.NotFoundException('Blog bulunamadı');
        if (blog.expertProfile.userId !== user.id)
            throw new common_1.ForbiddenException();
        await this.prisma.blog.delete({ where: { id } });
        return { message: 'Blog silindi' };
    }
    async getMyBlogs(userId) {
        const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
        if (!profile)
            throw new common_1.NotFoundException('Profil bulunamadı');
        return this.prisma.blog.findMany({ where: { expertProfileId: profile.id }, orderBy: { createdAt: 'desc' } });
    }
};
exports.BlogsService = BlogsService;
exports.BlogsService = BlogsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BlogsService);
//# sourceMappingURL=blogs.service.js.map