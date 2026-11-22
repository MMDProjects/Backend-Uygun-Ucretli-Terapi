import { TemplateCategory, TemplateStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListTemplatesQueryDto {
  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;
}
