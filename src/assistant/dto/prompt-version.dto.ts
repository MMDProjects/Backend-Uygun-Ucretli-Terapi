import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const PROMPT_MIN_CHARS = 500;
export const PROMPT_MAX_CHARS = 60000;
export const PROMPT_ADDENDUM_MAX_CHARS = 5000;

export class CreatePromptVersionDto {
  @IsString()
  @MinLength(PROMPT_MIN_CHARS)
  @MaxLength(PROMPT_MAX_CHARS)
  content!: string;

  // Kanala özel ekler; boş ya da null olabilir.
  @IsOptional()
  @IsString()
  @MaxLength(PROMPT_ADDENDUM_MAX_CHARS)
  whatsappAddendum?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(PROMPT_ADDENDUM_MAX_CHARS)
  instagramAddendum?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}

export class TestPromptDto {
  @IsString()
  @MinLength(PROMPT_MIN_CHARS)
  @MaxLength(PROMPT_MAX_CHARS)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROMPT_ADDENDUM_MAX_CHARS)
  whatsappAddendum?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(PROMPT_ADDENDUM_MAX_CHARS)
  instagramAddendum?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  // Önizlemenin hangi kanal gibi cevaplayacağı. Varsayılan WHATSAPP.
  @IsOptional()
  @IsIn(['WHATSAPP', 'INSTAGRAM'])
  channel?: 'WHATSAPP' | 'INSTAGRAM';
}
