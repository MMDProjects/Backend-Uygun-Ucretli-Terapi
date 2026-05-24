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
exports.ExpertRequestsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ExpertRequestsService = class ExpertRequestsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(user, expertProfileId, dto) {
        const expert = await this.prisma.expertProfile.findUnique({ where: { id: expertProfileId } });
        if (!expert)
            throw new common_1.NotFoundException('Uzman bulunamadı');
        return this.prisma.expertRequest.create({
            data: { userId: user.id, expertProfileId, message: dto.message },
        });
    }
    async findAll(page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [data, total] = await this.prisma.$transaction([
            this.prisma.expertRequest.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { firstName: true, lastName: true, email: true, phone: true } },
                    expertProfile: { select: { title: true, user: { select: { firstName: true, lastName: true } } } },
                },
            }),
            this.prisma.expertRequest.count(),
        ]);
        return { data, total, page, limit };
    }
    async updateStatus(id, status) {
        const req = await this.prisma.expertRequest.findUnique({ where: { id } });
        if (!req)
            throw new common_1.NotFoundException('Talep bulunamadı');
        return this.prisma.expertRequest.update({ where: { id }, data: { status } });
    }
};
exports.ExpertRequestsService = ExpertRequestsService;
exports.ExpertRequestsService = ExpertRequestsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ExpertRequestsService);
//# sourceMappingURL=expert-requests.service.js.map