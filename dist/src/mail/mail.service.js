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
var MailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const brevo_1 = require("@getbrevo/brevo");
let MailService = MailService_1 = class MailService {
    config;
    logger = new common_1.Logger(MailService_1.name);
    constructor(config) {
        this.config = config;
    }
    getClient() {
        const apiKey = this.config.get('BREVO_API_KEY');
        if (!apiKey || apiKey === 'your-brevo-api-key')
            return null;
        return new brevo_1.BrevoClient({ apiKey });
    }
    async sendPasswordReset(email, name, token) {
        const frontendUrl = this.config.get('FRONTEND_URL');
        const resetUrl = `${frontendUrl}/sifre-sifirla?token=${token}`;
        const client = this.getClient();
        if (!client) {
            this.logger.warn(`[DEV] Şifre sıfırlama linki: ${resetUrl}`);
            return;
        }
        try {
            await client.transactionalEmails.sendTransacEmail({
                subject: 'Şifre Sıfırlama Talebi',
                htmlContent: `
          <h2>Merhaba ${name},</h2>
          <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
          <a href="${resetUrl}" style="padding:12px 24px;background:#4F46E5;color:white;text-decoration:none;border-radius:6px;">
            Şifremi Sıfırla
          </a>
          <p>Bu bağlantı 30 dakika geçerlidir.</p>
        `,
                sender: {
                    name: this.config.get('BREVO_SENDER_NAME'),
                    email: this.config.get('BREVO_SENDER_EMAIL'),
                },
                to: [{ email, name }],
            });
        }
        catch (err) {
            this.logger.error('Mail gönderilemedi', err);
        }
    }
    async sendContactConfirmation(email, name) {
        const client = this.getClient();
        if (!client) {
            this.logger.warn(`[DEV] İletişim formu onayı: ${email}`);
            return;
        }
        try {
            await client.transactionalEmails.sendTransacEmail({
                subject: 'Mesajınız Alındı',
                htmlContent: `<h2>Merhaba ${name},</h2><p>Mesajınızı aldık, en kısa sürede size geri döneceğiz.</p>`,
                sender: {
                    name: this.config.get('BREVO_SENDER_NAME'),
                    email: this.config.get('BREVO_SENDER_EMAIL'),
                },
                to: [{ email, name }],
            });
        }
        catch (err) {
            this.logger.error('Mail gönderilemedi', err);
        }
    }
};
exports.MailService = MailService;
exports.MailService = MailService = MailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MailService);
//# sourceMappingURL=mail.service.js.map