import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsBoolean, Equals, Matches } from 'class-validator';

export class RegisterUzmanDto {
  @ApiProperty({ example: 'Dr. Ayşe', description: 'Ad' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Kara', description: 'Soyad' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'ayse@psiko.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '05331234567' })
  @Matches(/^[0-9]{10,11}$/, { message: 'Geçerli bir telefon numarası giriniz' })
  phone: string;

  @ApiProperty({ example: 'Sifre1234!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Uzman Klinik Psikolog', description: 'Unvan / uzmanlık başlığı' })
  @IsString()
  title: string;

  @ApiProperty({ example: true, description: 'KVKK onayı zorunludur' })
  @IsBoolean()
  @Equals(true, { message: 'KVKK onayı zorunludur' })
  kvkkConsent: boolean;
}
