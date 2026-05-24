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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const rxjs_1 = require("rxjs");
const notifications_service_1 = require("./notifications.service");
const sse_service_1 = require("./sse.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let NotificationsController = class NotificationsController {
    notificationsService;
    sseService;
    constructor(notificationsService, sseService) {
        this.notificationsService = notificationsService;
        this.sseService = sseService;
    }
    stream(user, _) {
        return this.sseService.register(user.id).asObservable();
    }
    getUnread(user) {
        return this.notificationsService.getUnread(user.id);
    }
    markRead(user, id) {
        return this.notificationsService.markRead(id, user.id);
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Sse)('stream'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'SSE bildirim akışı', description: 'EventSource ile bağlanılır. Admin DANGER_PANIC gönderdiğinde anlık pop-up tetiklenir. text/event-stream döner.' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '{ type: "notification", data: { type, message, id } }' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", rxjs_1.Observable)
], NotificationsController.prototype, "stream", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Okunmamış bildirimler' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "getUnread", null);
__decorate([
    (0, common_1.Patch)(':id/read'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, swagger_1.ApiOperation)({ summary: 'Bildirimi okundu işaretle' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Bildirim UUID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "markRead", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('notifications'),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService,
        sse_service_1.SseService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map