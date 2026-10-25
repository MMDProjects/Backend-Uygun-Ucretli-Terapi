import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class SearchMessagesQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100, { message: 'Arama metni 2-100 karakter olmalı.' })
  q: string;
}
