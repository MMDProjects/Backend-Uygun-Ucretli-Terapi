import { IsBoolean, IsOptional } from 'class-validator';

// Personelin DUR işaretini elle kaldırması ya da koyması için. Alanlar
// ayrı ayrı gönderilebilir; en az biri zorunludur (serviste kontrol edilir).
export class UpdateOptOutDto {
  @IsOptional()
  @IsBoolean()
  marketingOptOut?: boolean;

  @IsOptional()
  @IsBoolean()
  reminderOptOut?: boolean;
}
