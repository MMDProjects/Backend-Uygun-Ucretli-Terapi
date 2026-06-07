import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AssignQuestionDto {
  @ApiProperty({ example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', description: 'Sorunun atanacağı uzman profil UUID' })
  @IsString()
  @IsNotEmpty()
  expertProfileId: string;
}
