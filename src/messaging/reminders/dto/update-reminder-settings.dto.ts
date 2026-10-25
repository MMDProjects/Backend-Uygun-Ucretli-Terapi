import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class UpdateReminderSettingsDto {
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  // null seçimi kaldırır.
  @IsOptional()
  @IsUUID()
  reminderDayBeforeTemplateId?: string | null;

  @IsOptional()
  @IsUUID()
  reminderShortTemplateId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  reminderShortMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  reminderQuietStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  reminderQuietEnd?: number;
}
