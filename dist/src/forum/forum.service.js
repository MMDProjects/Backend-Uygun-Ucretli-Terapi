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
exports.ForumService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ForumService = class ForumService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createQuestion(user, dto) {
        return this.prisma.forumQuestion.create({
            data: { ...dto, userId: user.id, status: 'ONAY_BEKLIYOR' },
        });
    }
    async findAllPublic(page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const [data, total] = await this.prisma.$transaction([
            this.prisma.forumQuestion.findMany({
                where: { status: 'CEVAPLANDI' },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    answers: { where: { isApproved: true }, select: { content: true, createdAt: true, expertProfile: { select: { title: true, user: { select: { firstName: true, lastName: true } } } } } },
                },
            }),
            this.prisma.forumQuestion.count({ where: { status: 'CEVAPLANDI' } }),
        ]);
        return { data, total, page, limit };
    }
    async findOnePublic(id) {
        const q = await this.prisma.forumQuestion.findFirst({
            where: { id, status: 'CEVAPLANDI' },
            include: {
                answers: { where: { isApproved: true } },
            },
        });
        if (!q)
            throw new common_1.NotFoundException('Soru bulunamadı');
        return q;
    }
    async assignQuestion(id, dto) {
        const q = await this.prisma.forumQuestion.findUnique({ where: { id } });
        if (!q)
            throw new common_1.NotFoundException('Soru bulunamadı');
        return this.prisma.forumQuestion.update({
            where: { id },
            data: { expertProfileId: dto.expertProfileId, status: 'ATANDI' },
        });
    }
    async approveQuestion(id, approved) {
        const q = await this.prisma.forumQuestion.findUnique({ where: { id } });
        if (!q)
            throw new common_1.NotFoundException('Soru bulunamadı');
        return this.prisma.forumQuestion.update({
            where: { id },
            data: { status: approved ? 'ATANDI' : 'ONAY_BEKLIYOR' },
        });
    }
    async getAssignedQuestions(userId) {
        const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
        if (!profile)
            throw new common_1.NotFoundException('Profil bulunamadı');
        return this.prisma.forumQuestion.findMany({
            where: { expertProfileId: profile.id, status: { in: ['ATANDI', 'CEVAPLANDI'] } },
            orderBy: { createdAt: 'desc' },
        });
    }
    async createAnswer(userId, questionId, dto) {
        const profile = await this.prisma.expertProfile.findUnique({ where: { userId } });
        if (!profile)
            throw new common_1.ForbiddenException('Uzman profili bulunamadı');
        const q = await this.prisma.forumQuestion.findFirst({
            where: { id: questionId, expertProfileId: profile.id },
        });
        if (!q)
            throw new common_1.ForbiddenException('Bu soru size atanmamış');
        const answer = await this.prisma.forumAnswer.create({
            data: { questionId, expertProfileId: profile.id, content: dto.content },
        });
        await this.prisma.forumQuestion.update({
            where: { id: questionId },
            data: { status: 'CEVAPLANDI' },
        });
        return answer;
    }
    async approveAnswer(id) {
        const answer = await this.prisma.forumAnswer.findUnique({ where: { id } });
        if (!answer)
            throw new common_1.NotFoundException('Cevap bulunamadı');
        return this.prisma.forumAnswer.update({ where: { id }, data: { isApproved: true } });
    }
};
exports.ForumService = ForumService;
exports.ForumService = ForumService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ForumService);
//# sourceMappingURL=forum.service.js.map