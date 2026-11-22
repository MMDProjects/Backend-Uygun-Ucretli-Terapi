import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CampaignStatus, RecipientStatus } from '@prisma/client';
import { ContactFilterDto } from '../../contacts/dto/contact-filter.dto';
import { ParamSource } from '../campaign-rules';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const PARAM_SOURCES: ParamSource[] = ['firstName', 'fullName', 'static'];

export class ParamMappingItemDto {
  @IsString()
  @IsIn(PARAM_SOURCES, { message: 'Geçersiz değişken kaynağı.' })
  source: ParamSource;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  value?: string;
}

export class CreateCampaignDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 120)
  name: string;

  @IsUUID()
  templateId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ParamMappingItemDto)
  paramMapping?: ParamMappingItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  listIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactFilterDto)
  audienceFilter?: ContactFilterDto;
}

// null audienceFilter alanını temizler; alan yoksa değişmez.
export class UpdateCampaignDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ParamMappingItemDto)
  paramMapping?: ParamMappingItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  listIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ContactFilterDto)
  audienceFilter?: ContactFilterDto | null;
}

export class UpdateRecipientsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  contactIds: string[];

  @IsBoolean()
  included: boolean;
}

export class ScheduleCampaignDto {
  @IsISO8601()
  at: string;
}

export class UpdateCampaignSettingsDto {
  @IsOptional()
  @IsBoolean()
  campaignsEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100000)
  campaignUnitPrice?: number;
}

export class ListCampaignsQueryDto {
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListRecipientsQueryDto {
  @IsOptional()
  @IsEnum(RecipientStatus)
  status?: RecipientStatus;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  included?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
