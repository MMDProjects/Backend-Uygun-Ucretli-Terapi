import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaymentStatus, ServiceType } from '@prisma/client';

export class CreateAppointmentDto {
  @IsUUID()
  contactId: string;

  @IsUUID()
  therapistId: string;

  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @IsISO8601()
  scheduledAt: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsUUID()
  leadId?: string;
}
