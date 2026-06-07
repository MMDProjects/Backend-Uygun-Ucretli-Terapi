import { IsString, IsOptional, IsNumber, IsPositive, IsArray } from 'class-validator';

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  standardPrice?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  discountedPrice?: number;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsArray()
  announcementItems?: string[];

  @IsOptional()
  @IsArray()
  wheelSegments?: { label: string; description: string }[];

  @IsOptional()
  loginPopupSettings?: {
    title?: string;
    description?: string;
    benefits?: string[];
    buttonText?: string;
    buttonUrl?: string;
  };
}
