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
exports.ForumController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const forum_service_1 = require("./forum.service");
const create_question_dto_1 = require("./dto/create-question.dto");
const create_answer_dto_1 = require("./dto/create-answer.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let ForumController = class ForumController {
    forumService;
    constructor(forumService) {
        this.forumService = forumService;
    }
    createQuestion(user, dto) {
        return this.forumService.createQuestion(user, dto);
    }
    findAll(page = '1', limit = '10') {
        return this.forumService.findAllPublic(+page, +limit);
    }
    findOne(id) {
        return this.forumService.findOnePublic(id);
    }
    getAssignedQuestions(user) {
        return this.forumService.getAssignedQuestions(user.id);
    }
    createAnswer(user, id, dto) {
        return this.forumService.createAnswer(user.id, id, dto);
    }
};
exports.ForumController = ForumController;
__decorate([
    (0, roles_decorator_1.Roles)('DANISAN'),
    (0, common_1.Post)('questions'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Soru sor', description: 'Soru ONAY_BEKLIYOR statüsünde oluşur, admin onayladıktan sonra bir uzmana atanır.' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Soru oluşturuldu' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_question_dto_1.CreateQuestionDto]),
    __metadata("design:returntype", void 0)
], ForumController.prototype, "createQuestion", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('questions'),
    (0, swagger_1.ApiOperation)({ summary: 'Onaylı sorular (public)', description: 'Sadece CEVAPLANDI ve admin onaylı sorular listelenir.' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, example: 10 }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ForumController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('questions/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Soru detayı + onaylı cevaplar' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Soru UUID' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Soru bulunamadı veya henüz cevaplanmamış' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ForumController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Get)('me/questions'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Bana atanan sorular', description: 'Uzmanın cevaplamakla sorumlu olduğu sorular.' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ForumController.prototype, "getAssignedQuestions", null);
__decorate([
    (0, roles_decorator_1.Roles)('UZMAN'),
    (0, common_1.Post)('questions/:id/answers'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Soruyu cevapla', description: 'Sadece kendisine atanmış soruları cevaplayabilir. Cevap admin onayına gider.' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Soru UUID' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Bu soru size atanmamış' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_answer_dto_1.CreateAnswerDto]),
    __metadata("design:returntype", void 0)
], ForumController.prototype, "createAnswer", null);
exports.ForumController = ForumController = __decorate([
    (0, swagger_1.ApiTags)('forum'),
    (0, common_1.Controller)('forum'),
    __metadata("design:paramtypes", [forum_service_1.ForumService])
], ForumController);
//# sourceMappingURL=forum.controller.js.map