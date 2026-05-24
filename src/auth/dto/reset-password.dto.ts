import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'E-posta ile gelen sıfırlama token\'ı' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'YeniSifre123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
