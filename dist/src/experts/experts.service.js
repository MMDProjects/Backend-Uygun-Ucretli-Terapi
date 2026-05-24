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
exports.ExpertsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ExpertsService = class ExpertsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(filter) {
        const { tags, page = 1, limit = 10 } = filter;
        const skip = (page - 1) * limit;
        const tagIds = tags ? tags.split(',').filter(Boolean) : [];
        const where = {
            status: 'YAYINDA',
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
    async findOne(id) {
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
        if (!expert)
            throw new common_1.NotFoundException('Uzman bulunamadı');
        return expert;
    }
    async updateMyProfile(user, dto, avatarFile) {
        const profile = await this.prisma.expertProfile.findUnique({ where: { userId: user.id } });
        if (!profile)
            throw new common_1.NotFoundException('Profil bulunamadı');
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
    async getMyProfile(userId) {
        const profile = await this.prisma.expertProfile.findUnique({
            where: { userId },
            include: { tags: true, availabilities: true },
        });
        if (!profile)
            throw new common_1.NotFoundException('Profil bulunamadı');
        return profile;
    }
    async getMyAvailabilities(userId) {
        const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
        if (!profile)
            throw new common_1.NotFoundException('Profil bulunamadı');
        return this.prisma.availability.findMany({
            where: { expertProfileId: profile.id },
        });
    }
    async addAvailability(userId, dto) {
        const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
        if (!profile)
            throw new common_1.NotFoundException('Profil bulunamadı');
        return this.prisma.availability.create({
            data: { ...dto, expertProfileId: profile.id },
        });
    }
    async removeAvailability(userId, availId) {
        const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
        if (!profile)
            throw new common_1.NotFoundException('Profil bulunamadı');
        const avail = await this.prisma.availability.findUnique({ where: { id: availId } });
        if (!avail || avail.expertProfileId !== profile.id)
            throw new common_1.ForbiddenException();
        await this.prisma.availability.delete({ where: { id: availId } });
        return { message: 'Slot silindi' };
    }
    async getExpertAvailabilities(expertId) {
        const profile = await this.prisma.expertProfile.findFirst({
            where: { id: expertId, status: 'YAYINDA' },
        });
        if (!profile)
            throw new common_1.NotFoundException('Uzman bulunamadı');
        return this.prisma.availability.findMany({
            where: { expertProfileId: expertId, isBlockedByAdmin: false },
        });
    }
    async addFavorite(userId, expertProfileId) {
        const expert = await this.prisma.expertProfile.findUnique({ where: { id: expertProfileId } });
        if (!expert)
            throw new common_1.NotFoundException('Uzman bulunamadı');
        return this.prisma.favorite.upsert({
            where: { userId_expertProfileId: { userId, expertProfileId } },
            create: { userId, expertProfileId },
            update: {},
        });
    }
    async removeFavorite(userId, expertProfileId) {
        await this.prisma.favorite.deleteMany({ where: { userId, expertProfileId } });
        return { message: 'Favorilerden çıkarıldı' };
    }
    async getMyFavorites(userId) {
        return this.prisma.favorite.findMany({
            where: { userId },
            include: {
                expertProfile: {
                    select: { id: true, title: true, avatarUrl: true, rating: true, user: { select: { firstName: true, lastName: true } } },
                },
            },
        });
    }
};
exports.ExpertsService = ExpertsService;
exports.ExpertsService = ExpertsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ExpertsService);
//# sourceMappingURL=experts.service.js.map