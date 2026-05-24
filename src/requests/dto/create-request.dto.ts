import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateRequestDto {
  @ApiProperty({ example: 'Anksiyete sorunum için randevu almak istiyorum, uygun zamanınızı öğrenebilir miyim?', minLength: 10 })
  @IsString()
  @MinLength(10)
  message: string;
}
