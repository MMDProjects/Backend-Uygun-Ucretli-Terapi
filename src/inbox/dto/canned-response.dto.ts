import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const SHORTCUT_PATTERN = /^[a-z0-9-]{1,30}$/;
const SHORTCUT_MESSAGE =
  'Kısayol yalnızca küçük harf, rakam ve tire içerebilir (en fazla 30).';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCannedResponseDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Length(1, 80)
  title: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  content: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(SHORTCUT_PATTERN, { message: SHORTCUT_MESSAGE })
  shortcut?: string;
}

// shortcut null gönderilirse kısayol kaldırılır.
export class UpdateCannedResponseDto {
  @ValidateIf((_, v) => v !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Length(1, 80)
  title?: string;

  @ValidateIf((_, v) => v !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Length(1, 2000)
  content?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(SHORTCUT_PATTERN, { message: SHORTCUT_MESSAGE })
  shortcut?: string | null;
}

export class ListCannedResponsesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
