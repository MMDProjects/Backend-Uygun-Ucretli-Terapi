import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { KnowledgeCategory } from '@prisma/client';

export class ResolveUnansweredDto {
  @IsBoolean()
  addToKnowledge: boolean;

  @IsOptional()
  @IsEnum(KnowledgeCategory)
  category?: KnowledgeCategory;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  piiConfirmed?: boolean;
}
