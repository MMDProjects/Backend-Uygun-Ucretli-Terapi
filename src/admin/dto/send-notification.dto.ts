import { IsEnum, IsString, IsUUID } from 'class-validator';
import { NotificationType } from '@prisma/client';

export class SendNotificationDto {
  @IsUUID()
  userId: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  message: string;
}
