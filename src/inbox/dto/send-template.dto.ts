import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendTemplateDto {
  @IsUUID()
  templateId: string;

  @IsArray({ message: 'Değişkenler liste olmalı.' })
  @ArrayMaxSize(20, { message: 'En fazla 20 değişken girilebilir.' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true, message: 'Değişken boş olamaz.' })
  @MaxLength(500, {
    each: true,
    message: 'Her değişken en fazla 500 karakter olabilir.',
  })
  params: string[];

  // Başka personele atanmış konuşmada onaydan sonra gönderim için.
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
