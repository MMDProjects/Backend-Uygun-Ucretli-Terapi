import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateQuestionDto {
  @ApiProperty({ example: 'Anksiyete atakları nasıl yönetilir?', minLength: 5, maxLength: 200 })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Uzun zamandır panik atak yaşıyorum...', minLength: 20 })
  @IsString()
  @MinLength(20)
  content: string;
}
