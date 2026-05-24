import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateAnswerDto {
  @ApiProperty({ example: 'Anksiyete yönetimi için nefes egzersizleri...', minLength: 20 })
  @IsString()
  @MinLength(20)
  content: string;
}
