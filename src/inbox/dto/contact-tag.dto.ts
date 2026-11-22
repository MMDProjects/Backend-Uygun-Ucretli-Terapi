import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

export const TAG_COLORS = [
  'gray',
  'red',
  'amber',
  'green',
  'blue',
  'purple',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTagDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Length(1, 40)
  name: string;

  @IsOptional()
  @IsIn(TAG_COLORS)
  color?: TagColor;
}

// Güncellemede alanlar gönderilirse null kabul edilmez (400).
export class UpdateTagDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Length(1, 40)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(TAG_COLORS)
  color?: TagColor;
}
