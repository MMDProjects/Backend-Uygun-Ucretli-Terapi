import { NotificationType } from '@prisma/client';
export declare class SendNotificationDto {
    userId: string;
    type: NotificationType;
    message: string;
}
