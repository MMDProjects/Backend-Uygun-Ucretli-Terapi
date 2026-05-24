import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsBoolean, Equals, Matches } from 'class-validator';

export class RegisterDanisanDto {
  @ApiProperty({ example: 'Ahmet', description: 'Ad' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Yılmaz', description: 'Soyad' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'ahmet@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '05321234567', description: '10-11 haneli telefon' })
  @Matches(/^[0-9]{10,11}$/, { message: 'Geçerli bir telefon numarası giriniz' })
  phone: string;

  @ApiProperty({ example: 'Sifre1234!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır' })
  password: string;

  @ApiProperty({ example: true, description: 'KVKK onayı zorunludur' })
  @IsBoolean()
  @Equals(true, { message: 'KVKK onayı zorunludur' })
  kvkkConsent: boolean;
}
