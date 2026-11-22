import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Mesaj boş olamaz.' })
  @MaxLength(4096, { message: 'Mesaj en fazla 4096 karakter olabilir.' })
  content: string;

  // Başka personele atanmış konuşmada onaydan sonra gönderim için.
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
