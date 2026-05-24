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
exports.CommentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CommentsService = class CommentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(user, expertProfileId, dto) {
        const expert = await this.prisma.expertProfile.findUnique({ where: { id: expertProfileId } });
        if (!expert)
            throw new common_1.NotFoundException('Uzman bulunamadı');
        return this.prisma.comment.create({
            data: {
                userId: user.id,
                expertProfileId,
                content: dto.content,
                rating: dto.rating,
            },
        });
    }
    async findApproved(expertProfileId) {
        return this.prisma.comment.findMany({
            where: { expertProfileId, isApproved: true },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                content: true,
                rating: true,
                createdAt: true,
                user: { select: { firstName: true, lastName: true } },
            },
        });
    }
    async approve(id) {
        const comment = await this.prisma.comment.findUnique({ where: { id } });
        if (!comment)
            throw new common_1.NotFoundException('Yorum bulunamadı');
        await this.prisma.comment.update({ where: { id }, data: { isApproved: true } });
        const result = await this.prisma.comment.aggregate({
            where: { expertProfileId: comment.expertProfileId, isApproved: true },
            _avg: { rating: true },
        });
        const newRating = result._avg.rating ?? 5.0;
        await this.prisma.expertProfile.update({
            where: { id: comment.expertProfileId },
            data: { rating: newRating },
        });
        return { message: 'Yorum onaylandı', newRating };
    }
};
exports.CommentsService = CommentsService;
exports.CommentsService = CommentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CommentsService);
//# sourceMappingURL=comments.service.js.map