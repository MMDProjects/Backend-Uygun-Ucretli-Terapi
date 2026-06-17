import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsBoolean, Equals, Matches, IsOptional, IsArray, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

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
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @Equals(true, { message: 'KVKK onayı zorunludur' })
  kvkkConsent: boolean;

  @ApiPropertyOptional({ example: 'Deneyimli klinik psikolog...', description: 'Uzman biyografisi (80–150 kelime)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ type: [String], example: ['uuid-1', 'uuid-2'], description: 'Seçilen etiket UUID listesi (opsiyonel)' })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];
}
