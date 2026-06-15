import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExpertByAdminDto {
  @ApiProperty({ example: 'Ayşe' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Yılmaz' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'ayse@example.com' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz' })
  email: string;

  @ApiProperty({ example: 'Gizli123!' })
  @IsString()
  @MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır' })
  password: string;
}
