import { IsString, Length } from 'class-validator';

export class PreviewAssistantDto {
  @IsString()
  @Length(1, 1000)
  message: string;
}
