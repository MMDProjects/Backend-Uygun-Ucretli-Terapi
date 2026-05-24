import { IsString, IsEnum, IsBoolean, IsInt, IsOptional } from 'class-validator';
import { SssPage } from '@prisma/client';

export class UpsertSssDto {
  @IsString()
  question: string;

  @IsString()
  answer: string;

  @IsEnum(SssPage)
  page: SssPage;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  order?: number;
}
