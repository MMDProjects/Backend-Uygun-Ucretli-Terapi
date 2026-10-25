import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const PROMPT_MIN_CHARS = 500;
export const PROMPT_MAX_CHARS = 60000;

export class CreatePromptVersionDto {
  @IsString()
  @MinLength(PROMPT_MIN_CHARS)
  @MaxLength(PROMPT_MAX_CHARS)
  content!: string;

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;
}
