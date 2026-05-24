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
exports.TestsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const tests_service_1 = require("./tests.service");
const save_result_dto_1 = require("./dto/save-result.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let TestsController = class TestsController {
    testsService;
    constructor(testsService) {
        this.testsService = testsService;
    }
    findAll() {
        return this.testsService.findAll();
    }
    findBySlug(slug) {
        return this.testsService.findBySlug(slug);
    }
    saveResult(user, dto) {
        return this.testsService.saveResult(user, dto);
    }
    getHistory(user) {
        return this.testsService.getHistory(user.id);
    }
};
exports.TestsController = TestsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Aktif test listesi' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TestsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Test detayı' }),
    (0, swagger_1.ApiParam)({ name: 'slug', example: 'beck-anksiyete-olcegi' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Test bulunamadı veya aktif değil' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TestsController.prototype, "findBySlug", null);
__decorate([
    (0, roles_decorator_1.Roles)('DANISAN'),
    (0, common_1.Post)('results'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Test sonucunu kaydet', description: 'Test tamamlandıktan sonra skor özeti kaydedilir.' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Sonuç kaydedildi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, save_result_dto_1.SaveResultDto]),
    __metadata("design:returntype", void 0)
], TestsController.prototype, "saveResult", null);
__decorate([
    (0, roles_decorator_1.Roles)('DANISAN'),
    (0, common_1.Get)('history/me'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Test geçmişim', description: 'Giriş yapan danışanın daha önce çözdüğü tüm testler.' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TestsController.prototype, "getHistory", null);
exports.TestsController = TestsController = __decorate([
    (0, swagger_1.ApiTags)('tests'),
    (0, common_1.Controller)('tests'),
    __metadata("design:paramtypes", [tests_service_1.TestsService])
], TestsController);
//# sourceMappingURL=tests.controller.js.map