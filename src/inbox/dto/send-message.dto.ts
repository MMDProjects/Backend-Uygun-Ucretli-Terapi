import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Mesaj boş olamaz.' })
  @MaxLength(4096, { message: 'Mesaj en fazla 4096 karakter olabilir.' })
  content: string;
}
