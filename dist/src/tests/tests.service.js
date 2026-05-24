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
exports.TestsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let TestsService = class TestsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        return this.prisma.test.findMany({
            where: { isActive: true },
            select: { id: true, title: true, slug: true, description: true },
        });
    }
    async findBySlug(slug) {
        const test = await this.prisma.test.findUnique({ where: { slug } });
        if (!test || !test.isActive)
            throw new common_1.NotFoundException('Test bulunamadı');
        return test;
    }
    async saveResult(user, dto) {
        const test = await this.prisma.test.findUnique({ where: { id: dto.testId } });
        if (!test)
            throw new common_1.NotFoundException('Test bulunamadı');
        return this.prisma.testResult.create({
            data: { userId: user.id, testId: dto.testId, scoreSummary: dto.scoreSummary },
        });
    }
    async getHistory(userId) {
        return this.prisma.testResult.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { test: { select: { title: true, slug: true } } },
        });
    }
};
exports.TestsService = TestsService;
exports.TestsService = TestsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TestsService);
//# sourceMappingURL=tests.service.js.map