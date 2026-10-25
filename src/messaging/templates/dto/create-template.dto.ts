import { TemplateCategory } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,60}$/, {
    message:
      'Şablon adı yalnız küçük harf, rakam ve _ içerebilir (en fazla 60 karakter)',
  })
  name!: string;

  @IsEnum(TemplateCategory)
  category!: TemplateCategory;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(_[A-Z]{2})?$/, { message: 'Geçersiz dil kodu' })
  language?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  bodyText!: string;

  // Her değişken için bir örnek (Meta zorunlu tutar).
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  examples!: string[];
}
