import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateAvailabilityDto {
  @ApiProperty({ example: '2026-06-09', description: 'YYYY-MM-DD formatında tarih' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD formatında olmalı' })
  date: string;

  @ApiProperty({ example: '09:00', description: 'HH:MM formatı' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime HH:MM formatında olmalı' })
  startTime: string;

  @ApiProperty({ example: '12:00', description: 'HH:MM formatı' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime HH:MM formatında olmalı' })
  endTime: string;
}
