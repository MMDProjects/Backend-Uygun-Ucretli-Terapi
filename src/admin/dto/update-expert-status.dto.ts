import { IsEnum, IsString, IsOptional, ValidateIf } from 'class-validator';
import { ApprovalStatus } from '@prisma/client';

export class UpdateExpertStatusDto {
  @IsEnum(ApprovalStatus)
  status: ApprovalStatus;

  @ValidateIf((o: UpdateExpertStatusDto) => o.status === 'REDDEDILDI')
  @IsString({ message: 'Red durumunda açıklama zorunludur' })
  adminNote?: string;
}
