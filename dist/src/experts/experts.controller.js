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
exports.ExpertsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const swagger_1 = require("@nestjs/swagger");
const experts_service_1 = require("./experts.service");
const update_profile_dto_1 = require("./dto/update-profile.dto");
const create_availability_dto_1 = require("./dto/create-availability.dto");
const filter_experts_dto_1 = require("./dto/filter-experts.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let ExpertsController = class ExpertsController {
    expertsService;
    constructor(expertsService) {
        this.expertsService = expertsService;
    }
    findAll(filter) {
        return this.expertsService.findAll(filter);
    }
    findOne(id) {
        return this.expertsService.findOne(id);
    }
    getMyProfile(user) {
        return this.expertsService.getMyProfile(user.id);
    }
    updateMyProfile(user, dto, avatar) {
        return this.expertsService.updateMyProfile(user, dto, avatar);
    }
    getMyAvailabilities(user) {
        return this.expertsService.getMyAvailabilities(user.id);
    }
    addAvailability(user, dto) {
        return this.expertsService.addAvailability(user.id, dto);
    }
    removeAvailability(user, id) {
        return this.expertsService.removeAvailability(user.id, id);
    }
    getExpertAvailabilities(id) {
        return this.expertsService.getExpertAvailabilities(id);
    }
    addFavorite(user, id) {
        return this.expertsService.addFavorite(user.id, id);
    }
    removeFavorite(user, id) {
        return this.expertsService.removeFavorite(user.id, id);
    }
    getMyFavorites(user) {
        return this.expertsService.getMyFavorites(user.id);
    }
};
exports.ExpertsController = ExpertsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Uzman listesi', description: 'Sadece YAYINDA durumundaki uzmanlar döner. Fiyat bilgisi dönmez (sistem ayarlarından alınır).' }),
    (0, swagger_1.ApiQuery)({ name: 'tags', required: false, description: 'uuid1,uuid2 formatında etiket filtresi' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Uzman listesi + toplam sayı + sayfalama' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [filter_experts_dto_1.FilterExpertsDto]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Uzman detayı', description: 'Sadece YAYINDA durumundaki uzmanı döner.' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Uzman profil UUID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Uzman detay bilgisi' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Uzman bulunamadı' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Get)('me/profile'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Kendi profilim', description: 'Giriş yapan uzmanın kendi tam profil bilgisi.' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "getMyProfile", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Patch)('me'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Profil güncelle', description: 'Güncelleme sonrası profil ONAY_BEKLIYOR statüsüne düşer. Bio 80-150 kelime arası zorunlu.' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', example: 'Uzman Klinik Psikolog' },
                bio: { type: 'string', example: '80-150 kelime arası biyografi...' },
                education: { type: 'string', example: 'Hacettepe Üniversitesi...' },
                tagIds: { type: 'array', items: { type: 'string' }, example: ['uuid-1', 'uuid-2'] },
                avatar: { type: 'string', format: 'binary', description: 'Profil fotoğrafı (max 5MB)' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, schema: { example: { message: 'Profil güncellendi, admin onayı bekleniyor' } } }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('avatar', {
        storage: (0, multer_1.diskStorage)({
            destination: './uploads/avatars',
            filename: (req, file, cb) => {
                const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
                cb(null, unique + (0, path_1.extname)(file.originalname));
            },
        }),
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/'))
                cb(null, true);
            else
                cb(new Error('Sadece görsel dosyası yüklenebilir'), false);
        },
        limits: { fileSize: 5 * 1024 * 1024 },
    })),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdateProfileDto, Object]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "updateMyProfile", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Get)('me/availabilities'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Kendi müsaitlik slotlarım' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "getMyAvailabilities", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Post)('me/availabilities'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Müsaitlik slotu ekle', description: 'Haftanın belirli gün ve saatine müsaitlik ekler.' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Slot eklendi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_availability_dto_1.CreateAvailabilityDto]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "addAvailability", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Delete)('me/availabilities/:id'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Müsaitlik slotunu sil' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Slot UUID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "removeAvailability", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/availabilities'),
    (0, swagger_1.ApiOperation)({ summary: 'Uzman müsaitlik takvimi', description: 'Admin tarafından bloklanmış slotlar hariç tüm slotlar döner.' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Uzman profil UUID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "getExpertAvailabilities", null);
__decorate([
    (0, roles_decorator_1.Roles)('DANISAN'),
    (0, common_1.Post)(':id/favorites'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Favorilere ekle' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Uzman profil UUID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "addFavorite", null);
__decorate([
    (0, roles_decorator_1.Roles)('DANISAN'),
    (0, common_1.Delete)(':id/favorites'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Favorilerden çıkar' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Uzman profil UUID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "removeFavorite", null);
__decorate([
    (0, roles_decorator_1.Roles)('DANISAN'),
    (0, common_1.Get)('me/favorites'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Favorilerim' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ExpertsController.prototype, "getMyFavorites", null);
exports.ExpertsController = ExpertsController = __decorate([
    (0, swagger_1.ApiTags)('experts'),
    (0, common_1.Controller)('experts'),
    __metadata("design:paramtypes", [experts_service_1.ExpertsService])
], ExpertsController);
//# sourceMappingURL=experts.controller.js.map