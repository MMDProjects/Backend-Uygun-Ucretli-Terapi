import { IsBoolean, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { KnowledgeCategory } from '@prisma/client';

export class CreateKnowledgeDto {
  @IsEnum(KnowledgeCategory)
  category: KnowledgeCategory;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsBoolean()
  piiConfirmed: boolean;

  @IsOptional()
  @IsIn(['MANUAL', 'CONVERSATION'])
  source?: 'MANUAL' | 'CONVERSATION';
}
