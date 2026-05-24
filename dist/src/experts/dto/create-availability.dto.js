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
exports.CreateAvailabilityDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateAvailabilityDto {
    dayOfWeek;
    startTime;
    endTime;
}
exports.CreateAvailabilityDto = CreateAvailabilityDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1, description: '0=Pazar, 1=Pazartesi, ..., 6=Cumartesi', minimum: 0, maximum: 6 }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(6),
    __metadata("design:type", Number)
], CreateAvailabilityDto.prototype, "dayOfWeek", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '09:00', description: 'HH:MM formatı' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime HH:MM formatında olmalı' }),
    __metadata("design:type", String)
], CreateAvailabilityDto.prototype, "startTime", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '10:00', description: 'HH:MM formatı' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime HH:MM formatında olmalı' }),
    __metadata("design:type", String)
], CreateAvailabilityDto.prototype, "endTime", void 0);
//# sourceMappingURL=create-availability.dto.js.map