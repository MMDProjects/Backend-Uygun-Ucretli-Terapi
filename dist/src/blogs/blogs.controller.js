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
exports.BlogsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const blogs_service_1 = require("./blogs.service");
const create_blog_dto_1 = require("./dto/create-blog.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let BlogsController = class BlogsController {
    blogsService;
    constructor(blogsService) {
        this.blogsService = blogsService;
    }
    findAll(page = '1', limit = '10') {
        return this.blogsService.findAllPublic(+page, +limit);
    }
    findBySlug(slug) {
        return this.blogsService.findBySlug(slug);
    }
    getMyBlogs(user) {
        return this.blogsService.getMyBlogs(user.id);
    }
    create(user, dto) {
        return this.blogsService.create(user, dto);
    }
    update(user, id, dto) {
        return this.blogsService.update(user, id, dto);
    }
    delete(user, id) {
        return this.blogsService.delete(user, id);
    }
};
exports.BlogsController = BlogsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Yayındaki blog yazıları (public)' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], BlogsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Blog detayı' }),
    (0, swagger_1.ApiParam)({ name: 'slug', example: 'anksiyete-ile-basa-cikma-yollari' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Blog bulunamadı' }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BlogsController.prototype, "findBySlug", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Get)('me/list'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Kendi bloglarım' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BlogsController.prototype, "getMyBlogs", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Post)(),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Blog oluştur', description: 'TASLAK statüsünde oluşur, admin onayı gerekir.' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Blog oluşturuldu' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_blog_dto_1.CreateBlogDto]),
    __metadata("design:returntype", void 0)
], BlogsController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Blog güncelle', description: 'Güncelleme ONAY_BEKLIYOR statüsüne düşürür.' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Blog UUID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BlogsController.prototype, "update", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Blog sil' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Blog UUID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BlogsController.prototype, "delete", null);
exports.BlogsController = BlogsController = __decorate([
    (0, swagger_1.ApiTags)('blogs'),
    (0, common_1.Controller)('blogs'),
    __metadata("design:paramtypes", [blogs_service_1.BlogsService])
], BlogsController);
//# sourceMappingURL=blogs.controller.js.map