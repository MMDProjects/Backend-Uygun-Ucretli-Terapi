import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, ArrayMinSize, ArrayMaxSize, IsUUID } from 'class-validator';
import { WordCount } from '../../common/validators/word-count.validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Uzman Klinik Psikolog' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Merhaba, ben...', description: '80-150 kelime arasında olmalı' })
  @IsOptional()
  @IsString()
  @WordCount(80, 150)
  bio?: string;

  @ApiPropertyOptional({ example: 'Hacettepe Üniversitesi Psikoloji bölümü mezunuyum...' })
  @IsOptional()
  @IsString()
  education?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['uuid-1', 'uuid-2'],
    description: 'Min 2, Max 15 etiket UUID listesi',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, { message: 'En az 2 etiket seçilmelidir' })
  @ArrayMaxSize(15, { message: 'En fazla 15 etiket seçilebilir' })
  @IsUUID('all', { each: true })
  tagIds?: string[];
}
