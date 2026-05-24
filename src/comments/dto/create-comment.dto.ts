import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Harika bir uzman, gerçekten çok yardımcı oldu...', minLength: 20 })
  @IsString()
  @MinLength(20, { message: 'Yorum en az 20 karakter olmalıdır' })
  content: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: '1-5 arası yıldız puanı' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;
}
