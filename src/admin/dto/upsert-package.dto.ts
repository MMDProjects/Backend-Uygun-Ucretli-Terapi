import { IsString, IsInt, IsNumber, IsPositive, IsOptional } from 'class-validator';

export class UpsertPackageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  sessionCount?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
