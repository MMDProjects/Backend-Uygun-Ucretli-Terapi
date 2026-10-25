import { IsISO8601, IsOptional } from 'class-validator';

// Tarihler ISO 8601 biçimindedir (ör. 2026-10-01). Gün sınırları Europe/Istanbul'a göre.
export class AnalyticsQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
