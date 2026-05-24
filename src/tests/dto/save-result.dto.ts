import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class SaveResultDto {
  @ApiProperty({ example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', description: 'Test UUID' })
  @IsUUID()
  testId: string;

  @ApiProperty({ example: 'Orta düzey anksiyete (Skor: 42/80). Profesyonel destek önerilir.' })
  @IsString()
  scoreSummary: string;
}
