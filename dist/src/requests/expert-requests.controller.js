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
exports.ExpertRequestsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const expert_requests_service_1 = require("./expert-requests.service");
const create_request_dto_1 = require("./dto/create-request.dto");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let ExpertRequestsController = class ExpertRequestsController {
    service;
    constructor(service) {
        this.service = service;
    }
    create(user, expertId, dto) {
        return this.service.create(user, expertId, dto);
    }
};
exports.ExpertRequestsController = ExpertRequestsController;
__decorate([
    (0, roles_decorator_1.Roles)('DANISAN'),
    (0, common_1.Post)(':id/requests'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Uzmana talep gönder', description: 'Uzman detay sayfasından gönderilen form. Talep BEKLEMEDE statüsüyle admin paneline düşer.' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Uzman profil UUID' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Talep oluşturuldu' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Uzman bulunamadı' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_request_dto_1.CreateRequestDto]),
    __metadata("design:returntype", void 0)
], ExpertRequestsController.prototype, "create", null);
exports.ExpertRequestsController = ExpertRequestsController = __decorate([
    (0, swagger_1.ApiTags)('requests'),
    (0, common_1.Controller)('experts'),
    __metadata("design:paramtypes", [expert_requests_service_1.ExpertRequestsService])
], ExpertRequestsController);
//# sourceMappingURL=expert-requests.controller.js.map