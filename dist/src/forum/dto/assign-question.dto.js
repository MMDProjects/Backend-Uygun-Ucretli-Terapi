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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssignQuestionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AssignQuestionDto {
    expertProfileId;
}
exports.AssignQuestionDto = AssignQuestionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', description: 'Sorunun atanacağı uzman profil UUID' }),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AssignQuestionDto.prototype, "expertProfileId", void 0);
//# sourceMappingURL=assign-question.dto.js.map