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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const passport_1 = require("@nestjs/passport");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
const register_danisan_dto_1 = require("./dto/register-danisan.dto");
const register_uzman_dto_1 = require("./dto/register-uzman.dto");
const login_dto_1 = require("./dto/login.dto");
const refresh_token_dto_1 = require("./dto/refresh-token.dto");
const forgot_password_dto_1 = require("./dto/forgot-password.dto");
const reset_password_dto_1 = require("./dto/reset-password.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    registerDanisan(dto) {
        return this.authService.registerDanisan(dto);
    }
    registerUzman(dto, files) {
        return this.authService.registerUzman(dto, files);
    }
    login(dto) {
        return this.authService.login(dto);
    }
    refresh(user) {
        return this.authService.refresh(user.id, user.refreshToken);
    }
    logout(dto) {
        return this.authService.logout(dto.refreshToken);
    }
    forgotPassword(dto) {
        return this.authService.forgotPassword(dto);
    }
    resetPassword(dto) {
        return this.authService.resetPassword(dto);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('register/danisan'),
    (0, swagger_1.ApiOperation)({ summary: 'Danışan kaydı', description: 'Yeni bir danışan hesabı oluşturur ve token döner.' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Kayıt başarılı', schema: { example: { accessToken: 'eyJ...', refreshToken: 'eyJ...' } } }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'E-posta zaten kayıtlı' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_danisan_dto_1.RegisterDanisanDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "registerDanisan", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('register/uzman'),
    (0, swagger_1.ApiOperation)({ summary: 'Uzman kaydı (PDF upload)', description: 'Sertifika ve CV PDF zorunludur. multipart/form-data ile gönderilmeli.' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['firstName', 'lastName', 'email', 'phone', 'password', 'title', 'kvkkConsent', 'certificate', 'cv'],
            properties: {
                firstName: { type: 'string', example: 'Dr. Ayşe' },
                lastName: { type: 'string', example: 'Kara' },
                email: { type: 'string', example: 'ayse@psiko.com' },
                phone: { type: 'string', example: '05331234567' },
                password: { type: 'string', example: 'Sifre1234!' },
                title: { type: 'string', example: 'Uzman Klinik Psikolog' },
                kvkkConsent: { type: 'boolean', example: true },
                certificate: { type: 'string', format: 'binary', description: 'Sertifika PDF (max 10MB)' },
                cv: { type: 'string', format: 'binary', description: 'CV PDF (max 10MB)' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Uzman kaydı oluşturuldu, admin onayı bekleniyor' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'PDF dosyası eksik' }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: 'certificate', maxCount: 1 },
        { name: 'cv', maxCount: 1 },
    ], {
        storage: (0, multer_1.diskStorage)({
            destination: (req, file, cb) => {
                const dest = file.fieldname === 'certificate'
                    ? './uploads/certificates'
                    : './uploads/cvs';
                cb(null, dest);
            },
            filename: (req, file, cb) => {
                const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
                cb(null, unique + (0, path_1.extname)(file.originalname));
            },
        }),
        fileFilter: (req, file, cb) => {
            if (file.mimetype === 'application/pdf')
                cb(null, true);
            else
                cb(new Error('Sadece PDF dosyası yüklenebilir'), false);
        },
        limits: { fileSize: 10 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_uzman_dto_1.RegisterUzmanDto, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "registerUzman", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    (0, common_1.Post)('login'),
    (0, swagger_1.ApiOperation)({ summary: 'Giriş yap', description: 'Dakikada max 5 istek. Başarılı girişte accessToken (15dk) ve refreshToken (7gün) döner.' }),
    (0, swagger_1.ApiResponse)({ status: 200, schema: { example: { accessToken: 'eyJ...', refreshToken: 'eyJ...' } } }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Geçersiz kimlik bilgileri' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Çok fazla istek (rate limit)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt-refresh')),
    (0, common_1.Post)('refresh'),
    (0, swagger_1.ApiOperation)({ summary: 'Token yenile', description: 'Süresi dolmamış refreshToken ile yeni accessToken alır. Eski refreshToken geçersiz olur (rotasyon).' }),
    (0, swagger_1.ApiResponse)({ status: 200, schema: { example: { accessToken: 'eyJ...', refreshToken: 'eyJ...' } } }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Çıkış yap', description: 'RefreshToken\'ı veritabanından siler.' }),
    (0, swagger_1.ApiResponse)({ status: 200, schema: { example: { message: 'Çıkış yapıldı' } } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "logout", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('forgot-password'),
    (0, swagger_1.ApiOperation)({ summary: 'Şifremi unuttum', description: 'Kayıtlı e-postaya 30 dakika geçerli sıfırlama linki gönderir.' }),
    (0, swagger_1.ApiResponse)({ status: 200, schema: { example: { message: 'Eğer e-posta kayıtlıysa sıfırlama bağlantısı gönderildi' } } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [forgot_password_dto_1.ForgotPasswordDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('reset-password'),
    (0, swagger_1.ApiOperation)({ summary: 'Şifre sıfırla', description: 'E-postadan gelen token ile şifreyi günceller.' }),
    (0, swagger_1.ApiResponse)({ status: 200, schema: { example: { message: 'Şifre başarıyla güncellendi' } } }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Geçersiz veya süresi dolmuş token' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reset_password_dto_1.ResetPasswordDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resetPassword", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map