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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_service_1 = require("./admin.service");
const update_expert_status_dto_1 = require("./dto/update-expert-status.dto");
const update_system_settings_dto_1 = require("./dto/update-system-settings.dto");
const send_notification_dto_1 = require("./dto/send-notification.dto");
const upsert_sss_dto_1 = require("./dto/upsert-sss.dto");
const upsert_package_dto_1 = require("./dto/upsert-package.dto");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const assign_question_dto_1 = require("../forum/dto/assign-question.dto");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
class UpdateBlogStatusDto {
    status;
    adminNote;
}
__decorate([
    (0, class_validator_1.IsEnum)(client_1.ApprovalStatus),
    __metadata("design:type", String)
], UpdateBlogStatusDto.prototype, "status", void 0);
class UpdateRequestStatusDto {
    status;
}
__decorate([
    (0, class_validator_1.IsEnum)(client_1.RequestStatus),
    __metadata("design:type", String)
], UpdateRequestStatusDto.prototype, "status", void 0);
class PriorityDto {
    priorityScore;
}
class BlockDto {
    block;
}
class CreateTagDto {
    name;
}
class ToggleTagDto {
    isActive;
}
let AdminController = class AdminController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    getDashboard() {
        return this.adminService.getDashboard();
    }
    getExperts(page = '1', limit = '20') {
        return this.adminService.getExperts(+page, +limit);
    }
    updateExpertStatus(id, dto) {
        return this.adminService.updateExpertStatus(id, dto);
    }
    updateExpertPriority(id, dto) {
        return this.adminService.updateExpertPriority(id, dto.priorityScore);
    }
    getExpertAvailabilities(id) {
        return this.adminService.getExpertAvailabilities(id);
    }
    blockAvailability(id, dto) {
        return this.adminService.blockAvailability(id, dto.block);
    }
    getBlogs(page = '1', limit = '20') {
        return this.adminService.getBlogs(+page, +limit);
    }
    updateBlogStatus(id, dto) {
        return this.adminService.updateBlogStatus(id, dto.status, dto.adminNote);
    }
    getForumQuestions(status) {
        return this.adminService.getForumQuestions(status);
    }
    assignForumQuestion(id, dto) {
        return this.adminService.assignForumQuestion(id, dto.expertProfileId);
    }
    approveForumQuestion(id) {
        return this.adminService.approveForumQuestion(id);
    }
    approveForumAnswer(id) {
        return this.adminService.approveForumAnswer(id);
    }
    approveComment(id) {
        return this.adminService.approveComment(id);
    }
    getRequests(page = '1', limit = '20') {
        return this.adminService.getRequests(+page, +limit);
    }
    updateRequestStatus(id, dto) {
        return this.adminService.updateRequestStatus(id, dto.status);
    }
    getSettings() {
        return this.adminService.getSettings();
    }
    updateSettings(dto) {
        return this.adminService.updateSettings(dto);
    }
    getPackages() {
        return this.adminService.getPackages();
    }
    updatePackage(id, dto) {
        return this.adminService.updatePackage(id, dto);
    }
    getSss() {
        return this.adminService.getSss();
    }
    createSss(dto) {
        return this.adminService.createSss(dto);
    }
    updateSss(id, dto) {
        return this.adminService.updateSss(id, dto);
    }
    deleteSss(id) {
        return this.adminService.deleteSss(id);
    }
    sendNotification(dto) {
        return this.adminService.sendNotification(dto);
    }
    getTags() {
        return this.adminService.getTags();
    }
    createTag(dto) {
        return this.adminService.createTag(dto.name);
    }
    toggleTag(id, dto) {
        return this.adminService.toggleTag(id, dto.isActive);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getDashboard", null);
__decorate([
    (0, common_1.Get)('experts'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getExperts", null);
__decorate([
    (0, common_1.Patch)('experts/:id/status'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_expert_status_dto_1.UpdateExpertStatusDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateExpertStatus", null);
__decorate([
    (0, common_1.Patch)('experts/:id/priority'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, PriorityDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateExpertPriority", null);
__decorate([
    (0, common_1.Get)('experts/:id/availabilities'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getExpertAvailabilities", null);
__decorate([
    (0, common_1.Patch)('availabilities/:id/block'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, BlockDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "blockAvailability", null);
__decorate([
    (0, common_1.Get)('blogs'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getBlogs", null);
__decorate([
    (0, common_1.Patch)('blogs/:id/status'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateBlogStatusDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateBlogStatus", null);
__decorate([
    (0, common_1.Get)('forum/questions'),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getForumQuestions", null);
__decorate([
    (0, common_1.Patch)('forum/questions/:id/assign'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, assign_question_dto_1.AssignQuestionDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "assignForumQuestion", null);
__decorate([
    (0, common_1.Patch)('forum/questions/:id/approve'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "approveForumQuestion", null);
__decorate([
    (0, common_1.Patch)('forum/answers/:id/approve'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "approveForumAnswer", null);
__decorate([
    (0, common_1.Patch)('comments/:id/approve'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "approveComment", null);
__decorate([
    (0, common_1.Get)('requests'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getRequests", null);
__decorate([
    (0, common_1.Patch)('requests/:id/status'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateRequestStatusDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateRequestStatus", null);
__decorate([
    (0, common_1.Get)('settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Put)('settings'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_system_settings_dto_1.UpdateSystemSettingsDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Get)('packages'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getPackages", null);
__decorate([
    (0, common_1.Put)('packages/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, upsert_package_dto_1.UpsertPackageDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updatePackage", null);
__decorate([
    (0, common_1.Get)('sss'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getSss", null);
__decorate([
    (0, common_1.Post)('sss'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [upsert_sss_dto_1.UpsertSssDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createSss", null);
__decorate([
    (0, common_1.Patch)('sss/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, upsert_sss_dto_1.UpsertSssDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateSss", null);
__decorate([
    (0, common_1.Delete)('sss/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteSss", null);
__decorate([
    (0, common_1.Post)('notifications'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_notification_dto_1.SendNotificationDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "sendNotification", null);
__decorate([
    (0, common_1.Get)('tags'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getTags", null);
__decorate([
    (0, common_1.Post)('tags'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateTagDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createTag", null);
__decorate([
    (0, common_1.Patch)('tags/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ToggleTagDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "toggleTag", null);
exports.AdminController = AdminController = __decorate([
    (0, swagger_1.ApiTags)('admin'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map