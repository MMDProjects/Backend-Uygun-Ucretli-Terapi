"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const crypto = __importStar(require("crypto"));
const prisma_service_1 = require("../prisma/prisma.service");
const mail_service_1 = require("../mail/mail.service");
let AuthService = class AuthService {
    prisma;
    jwt;
    config;
    mail;
    constructor(prisma, jwt, config, mail) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.config = config;
        this.mail = mail;
    }
    async registerDanisan(dto) {
        const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (exists)
            throw new common_1.ConflictException('Bu e-posta zaten kayıtlı');
        const hash = await bcrypt.hash(dto.password, 12);
        const user = await this.prisma.user.create({
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                email: dto.email,
                phone: dto.phone,
                passwordHash: hash,
                role: 'DANISAN',
            },
        });
        return this.generateTokens(user.id, user.email, user.role);
    }
    async registerUzman(dto, files) {
        if (!files.certificate?.[0])
            throw new common_1.BadRequestException('Sertifika PDF zorunludur');
        if (!files.cv?.[0])
            throw new common_1.BadRequestException('CV PDF zorunludur');
        const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (exists)
            throw new common_1.ConflictException('Bu e-posta zaten kayıtlı');
        const hash = await bcrypt.hash(dto.password, 12);
        const certificateUrl = `/uploads/certificates/${files.certificate[0].filename}`;
        const cvUrl = `/uploads/cvs/${files.cv[0].filename}`;
        const user = await this.prisma.user.create({
            data: {
                firstName: dto.firstName,
                lastName: dto.lastName,
                email: dto.email,
                phone: dto.phone,
                passwordHash: hash,
                role: 'UZMAN',
                expertProfile: {
                    create: {
                        title: dto.title,
                        certificateUrl,
                        cvUrl,
                        status: 'TASLAK',
                    },
                },
            },
        });
        return this.generateTokens(user.id, user.email, user.role);
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user || !user.isActive)
            throw new common_1.UnauthorizedException('Geçersiz kimlik bilgileri');
        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid)
            throw new common_1.UnauthorizedException('Geçersiz kimlik bilgileri');
        return this.generateTokens(user.id, user.email, user.role);
    }
    async refresh(userId, oldRefreshToken) {
        await this.prisma.refreshToken.delete({ where: { token: oldRefreshToken } });
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.UnauthorizedException();
        return this.generateTokens(user.id, user.email, user.role);
    }
    async logout(refreshToken) {
        await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
        return { message: 'Çıkış yapıldı' };
    }
    async forgotPassword(dto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user)
            return { message: 'Eğer e-posta kayıtlıysa sıfırlama bağlantısı gönderildi' };
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 30 * 60 * 1000);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { passwordResetToken: token, passwordResetExpires: expires },
        });
        await this.mail.sendPasswordReset(user.email, user.firstName, token);
        return { message: 'Eğer e-posta kayıtlıysa sıfırlama bağlantısı gönderildi' };
    }
    async resetPassword(dto) {
        const user = await this.prisma.user.findFirst({
            where: {
                passwordResetToken: dto.token,
                passwordResetExpires: { gt: new Date() },
            },
        });
        if (!user)
            throw new common_1.BadRequestException('Geçersiz veya süresi dolmuş token');
        const hash = await bcrypt.hash(dto.newPassword, 12);
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: hash,
                passwordResetToken: null,
                passwordResetExpires: null,
            },
        });
        return { message: 'Şifre başarıyla güncellendi' };
    }
    async generateTokens(userId, email, role) {
        const payload = { sub: userId, email, role };
        const accessToken = this.jwt.sign(payload, {
            secret: this.config.get('JWT_ACCESS_SECRET'),
            expiresIn: this.config.get('JWT_ACCESS_EXPIRES'),
        });
        const refreshToken = this.jwt.sign(payload, {
            secret: this.config.get('JWT_REFRESH_SECRET'),
            expiresIn: this.config.get('JWT_REFRESH_EXPIRES'),
        });
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await this.prisma.refreshToken.create({
            data: { token: refreshToken, userId, expiresAt },
        });
        return { accessToken, refreshToken };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        mail_service_1.MailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map