import { PrismaService } from '../prisma/prisma.service';
import { SseService } from './sse.service';
import { NotificationType } from '@prisma/client';
export declare class NotificationsService {
    private prisma;
    private sse;
    constructor(prisma: PrismaService, sse: SseService);
    send(userId: string, type: NotificationType, message: string): Promise<{
        id: string;
        createdAt: Date;
        type: import("@prisma/client").$Enums.NotificationType;
        message: string;
        userId: string;
        isRead: boolean;
    }>;
    getUnread(userId: string): Promise<{
        id: string;
        createdAt: Date;
        type: import("@prisma/client").$Enums.NotificationType;
        message: string;
        userId: string;
        isRead: boolean;
    }[]>;
    markRead(id: string, userId: string): Promise<import("@prisma/client").Prisma.BatchPayload>;
}
