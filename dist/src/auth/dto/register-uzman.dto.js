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
exports.RegisterUzmanDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class RegisterUzmanDto {
    firstName;
    lastName;
    email;
    phone;
    password;
    title;
    kvkkConsent;
}
exports.RegisterUzmanDto = RegisterUzmanDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Dr. Ayşe', description: 'Ad' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterUzmanDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Kara', description: 'Soyad' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterUzmanDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ayse@psiko.com' }),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], RegisterUzmanDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '05331234567' }),
    (0, class_validator_1.Matches)(/^[0-9]{10,11}$/, { message: 'Geçerli bir telefon numarası giriniz' }),
    __metadata("design:type", String)
], RegisterUzmanDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Sifre1234!', minLength: 8 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], RegisterUzmanDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Uzman Klinik Psikolog', description: 'Unvan / uzmanlık başlığı' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterUzmanDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'KVKK onayı zorunludur' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.Equals)(true, { message: 'KVKK onayı zorunludur' }),
    __metadata("design:type", Boolean)
], RegisterUzmanDto.prototype, "kvkkConsent", void 0);
//# sourceMappingURL=register-uzman.dto.js.map