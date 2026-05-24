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
exports.RegisterDanisanDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class RegisterDanisanDto {
    firstName;
    lastName;
    email;
    phone;
    password;
    kvkkConsent;
}
exports.RegisterDanisanDto = RegisterDanisanDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Ahmet', description: 'Ad' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterDanisanDto.prototype, "firstName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Yılmaz', description: 'Soyad' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterDanisanDto.prototype, "lastName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ahmet@example.com' }),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], RegisterDanisanDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '05321234567', description: '10-11 haneli telefon' }),
    (0, class_validator_1.Matches)(/^[0-9]{10,11}$/, { message: 'Geçerli bir telefon numarası giriniz' }),
    __metadata("design:type", String)
], RegisterDanisanDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Sifre1234!', minLength: 8 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8, { message: 'Şifre en az 8 karakter olmalıdır' }),
    __metadata("design:type", String)
], RegisterDanisanDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'KVKK onayı zorunludur' }),
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.Equals)(true, { message: 'KVKK onayı zorunludur' }),
    __metadata("design:type", Boolean)
], RegisterDanisanDto.prototype, "kvkkConsent", void 0);
//# sourceMappingURL=register-danisan.dto.js.map