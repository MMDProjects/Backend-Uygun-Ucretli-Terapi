import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { createAuthTestApp } from './helpers/create-test-app';
import { buildPrismaMock, MOCK_DANISAN_ID, MOCK_UZMAN_ID } from './helpers/prisma-mock';
import { danisanToken, uzmanToken, bearerHeader } from './helpers/auth.helper';

const NOTIF_ID = 'notif-uuid-0000-0000-0000-000000000001';

const mockNotification = {
  id: NOTIF_ID,
  userId: MOCK_DANISAN_ID,
  type: 'PROFIL_ONAYLANDI',
  message: 'Profiliniz onaylandÄ±.',
  isRead: false,
  createdAt: new Date('2024-05-01'),
};

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createAuthTestApp([NotificationsModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // â”€â”€ GET /notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /notifications', () => {
    it('should return unread notifications for authenticated user', async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      const res = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: NOTIF_ID,
        isRead: false,
        message: 'Profiliniz onaylandÄ±.',
      });
      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: MOCK_DANISAN_ID,
            isRead: false,
          }),
        }),
      );
    });

    it('should return empty array when all notifications are read', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return 401 when no auth token provided', async () => {
      await request(app.getHttpServer())
        .get('/notifications')
        .expect(401);
    });

    it('should only return current user notifications (UZMAN)', async () => {
      const uzmanNotif = { ...mockNotification, userId: MOCK_UZMAN_ID, id: 'notif-uzman' };
      prismaMock.notification.findMany.mockResolvedValue([uzmanNotif]);

      const res = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(200);

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: MOCK_UZMAN_ID }),
        }),
      );
    });
  });

  // â”€â”€ PATCH /notifications/:id/read â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('PATCH /notifications/:id/read', () => {
    it('should mark notification as read for the owner', async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .patch(`/notifications/${NOTIF_ID}/read`)
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: NOTIF_ID,
            userId: MOCK_DANISAN_ID,
          }),
          data: { isRead: true },
        }),
      );
    });

    it('should return count=0 silently when notification belongs to another user (ownership protection)', async () => {
      // updateMany with wrong userId returns count:0 â€” no error thrown, ownership enforced at DB level
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const res = await request(app.getHttpServer())
        .patch(`/notifications/${NOTIF_ID}/read`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(200);

      // count: 0 = bildirim bulunamadÄ± veya baÅŸka kullanÄ±cÄ±ya ait
      expect(res.body).toMatchObject({ count: 0 });
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .patch(`/notifications/${NOTIF_ID}/read`)
        .expect(401);
    });

    it('should handle invalid UUID gracefully', async () => {
      // UUID deÄŸil string gelirse NestJS route param olarak kabul eder,
      // updateMany ise empty result dÃ¶ner
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      await request(app.getHttpServer())
        .patch('/notifications/gecersiz-id/read')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200); // controller 404 atmÄ±yor, updateMany count:0 dÃ¶ner
    });
  });
});
