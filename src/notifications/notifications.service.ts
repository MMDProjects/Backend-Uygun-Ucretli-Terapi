import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SseService } from './sse.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private sse: SseService) {}

  async notifyAdmins(type: NotificationType, message: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    await Promise.all(admins.map((a) => this.send(a.id, type, message).catch(() => {})));
  }

  async send(userId: string, type: NotificationType, message: string) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, message },
    });

    this.sse.emit(userId, { data: { type, message, id: notification.id }, type: 'notification' });
    return notification;
  }

  async getUnread(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAll(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }
}
