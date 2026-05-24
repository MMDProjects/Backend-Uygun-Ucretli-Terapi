import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsEnum, IsBoolean, IsOptional, Matches } from 'class-validator';
import { ContactSubject } from '@prisma/client';

export class CreateContactDto {
  @ApiProperty({ example: 'Ahmet Yılmaz' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'ahmet@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '05321234567' })
  @Matches(/^[0-9]{10,11}$/)
  phone: string;

  @ApiProperty({ enum: ContactSubject, example: 'RANDEVU_OLUSTURUN' })
  @IsEnum(ContactSubject)
  subject: ContactSubject;

  @ApiProperty({ example: 'Randevu almak istiyorum, nasıl ilerleyebilirim?' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ example: false, default: false, description: 'Kurumsal başvuru mu?' })
  @IsBoolean()
  @IsOptional()
  isCorporate?: boolean;

  @ApiPropertyOptional({ example: 'ABC A.Ş.', description: 'isCorporate true ise zorunlu' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: '50-100', description: 'Çalışan sayısı aralığı' })
  @IsOptional()
  @IsString()
  employeeCount?: string;
}
