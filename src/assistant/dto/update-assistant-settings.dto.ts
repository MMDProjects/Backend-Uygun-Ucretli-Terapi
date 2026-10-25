import { AssistantMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAssistantSettingsDto {
  @IsOptional()
  @IsEnum(AssistantMode)
  mode?: AssistantMode;

  // null veya boş metin bilgilendirmeyi kaldırır.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  noticeText?: string | null;
}
