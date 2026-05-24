import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Login\'den dönen refreshToken değeri' })
  @IsString()
  refreshToken: string;
}
