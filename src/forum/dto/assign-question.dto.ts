import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignQuestionDto {
  @ApiProperty({ example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', description: 'Sorunun atanacağı uzman profil UUID' })
  @IsUUID()
  expertProfileId: string;
}
