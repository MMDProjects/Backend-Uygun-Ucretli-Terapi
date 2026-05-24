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
var NewsletterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsletterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const brevo_1 = require("@getbrevo/brevo");
const prisma_service_1 = require("../prisma/prisma.service");
let NewsletterService = NewsletterService_1 = class NewsletterService {
    prisma;
    config;
    logger = new common_1.Logger(NewsletterService_1.name);
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
    }
    async subscribe(dto) {
        const exists = await this.prisma.newsletter.findUnique({ where: { email: dto.email } });
        if (exists)
            throw new common_1.ConflictException('Bu e-posta zaten kayıtlı');
        await this.prisma.newsletter.create({ data: { email: dto.email } });
        this.syncToBrevo(dto.email).catch((err) => this.logger.error('Brevo senkronizasyon hatası', err));
        return { message: 'Bültene başarıyla kaydoldunuz' };
    }
    async syncToBrevo(email) {
        const apiKey = this.config.get('BREVO_API_KEY');
        const listId = this.config.get('BREVO_NEWSLETTER_LIST_ID');
        if (!apiKey || apiKey === 'your-brevo-api-key') {
            this.logger.warn(`[DEV] Brevo'ya kaydedilecek: ${email}`);
            return;
        }
        const client = new brevo_1.BrevoClient({ apiKey });
        await client.contacts.createContact({
            email,
            listIds: [Number(listId)],
            updateEnabled: true,
        });
    }
};
exports.NewsletterService = NewsletterService;
exports.NewsletterService = NewsletterService = NewsletterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, config_1.ConfigService])
], NewsletterService);
//# sourceMappingURL=newsletter.service.js.map