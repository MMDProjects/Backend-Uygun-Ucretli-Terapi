import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, Max, Matches } from 'class-validator';

export class CreateAvailabilityDto {
  @ApiProperty({ example: 1, description: '0=Pazar, 1=Pazartesi, ..., 6=Cumartesi', minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00', description: 'HH:MM formatı' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime HH:MM formatında olmalı' })
  startTime: string;

  @ApiProperty({ example: '10:00', description: 'HH:MM formatı' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime HH:MM formatında olmalı' })
  endTime: string;
}
