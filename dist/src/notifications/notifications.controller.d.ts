import { Observable } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { SseService } from './sse.service';
import type { User } from '@prisma/client';
export declare class NotificationsController {
    private readonly notificationsService;
    private readonly sseService;
    constructor(notificationsService: NotificationsService, sseService: SseService);
    stream(user: User, _: unknown): Observable<{
        data: unknown;
    }>;
    getUnread(user: User): Promise<{
        id: string;
        createdAt: Date;
        type: import("@prisma/client").$Enums.NotificationType;
        message: string;
        userId: string;
        isRead: boolean;
    }[]>;
    markRead(user: User, id: string): Promise<import("@prisma/client").Prisma.BatchPayload>;
}
