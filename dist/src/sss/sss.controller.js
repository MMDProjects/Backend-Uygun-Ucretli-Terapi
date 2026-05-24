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
exports.SssController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const sss_service_1 = require("./sss.service");
const client_1 = require("@prisma/client");
const public_decorator_1 = require("../common/decorators/public.decorator");
let SssController = class SssController {
    sssService;
    constructor(sssService) {
        this.sssService = sssService;
    }
    findAll(page) {
        return this.sssService.findByPage(page);
    }
};
exports.SssController = SssController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'SSS listesi', description: 'page parametresi verilmezse tüm sayfaların SSS\'leri döner.' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, enum: client_1.SssPage, description: 'GENEL | TESTLER | PAKETLER' }),
    __param(0, (0, common_1.Query)('page')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SssController.prototype, "findAll", null);
exports.SssController = SssController = __decorate([
    (0, swagger_1.ApiTags)('sss'),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('sss'),
    __metadata("design:paramtypes", [sss_service_1.SssService])
], SssController);
//# sourceMappingURL=sss.controller.js.map