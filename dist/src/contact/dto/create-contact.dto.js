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
exports.CreateContactDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
class CreateContactDto {
    fullName;
    email;
    phone;
    subject;
    message;
    isCorporate;
    companyName;
    employeeCount;
}
exports.CreateContactDto = CreateContactDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Ahmet Yılmaz' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateContactDto.prototype, "fullName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ahmet@example.com' }),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], CreateContactDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '05321234567' }),
    (0, class_validator_1.Matches)(/^[0-9]{10,11}$/),
    __metadata("design:type", String)
], CreateContactDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: client_1.ContactSubject, example: 'RANDEVU_OLUSTURUN' }),
    (0, class_validator_1.IsEnum)(client_1.ContactSubject),
    __metadata("design:type", String)
], CreateContactDto.prototype, "subject", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Randevu almak istiyorum, nasıl ilerleyebilirim?' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateContactDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: false, default: false, description: 'Kurumsal başvuru mu?' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateContactDto.prototype, "isCorporate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'ABC A.Ş.', description: 'isCorporate true ise zorunlu' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateContactDto.prototype, "companyName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '50-100', description: 'Çalışan sayısı aralığı' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateContactDto.prototype, "employeeCount", void 0);
//# sourceMappingURL=create-contact.dto.js.map