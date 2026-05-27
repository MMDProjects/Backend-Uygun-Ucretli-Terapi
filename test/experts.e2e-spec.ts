import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ExpertsModule } from '../src/experts/experts.module';
import { createAuthTestApp } from './helpers/create-test-app';
import {
  buildPrismaMock,
  MOCK_DANISAN_ID,
  MOCK_UZMAN_ID,
  MOCK_EXPERT_PROFILE_ID,
  mockExpertProfile,
} from './helpers/prisma-mock';
import { danisanToken, uzmanToken, bearerHeader } from './helpers/auth.helper';

// Valid UUID v4: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
const AVAIL_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const mockPublicProfile = {
  ...mockExpertProfile(),
  user: { firstName: 'Dr. Ayse', lastName: 'Kara' },
  tags: [{ id: 'tag-1', name: 'Anksiyete' }, { id: 'tag-2', name: 'Depresyon' }],
  rating: 4.8,
};

describe('Experts (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createAuthTestApp([ExpertsModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /experts (public) ──────────────────────────────────────────────────────

  describe('GET /experts', () => {
    it('should return public expert list with pagination', async () => {
      prismaMock.$transaction.mockResolvedValue([[mockPublicProfile], 1]);

      const res = await request(app.getHttpServer())
        .get('/experts')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total', 1);
    });

    it('should return empty list when no experts exist', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      const res = await request(app.getHttpServer())
        .get('/experts')
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('should be accessible without auth token', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await request(app.getHttpServer())
        .get('/experts')
        .expect(200);
    });
  });

  // ── GET /experts/tags (public) ────────────────────────────────────────────────

  describe('GET /experts/tags', () => {
    it('should return active tags', async () => {
      prismaMock.tag.findMany.mockResolvedValue([
        { id: 'tag-1', name: 'Anksiyete', isActive: true },
        { id: 'tag-2', name: 'Depresyon', isActive: true },
      ]);

      const res = await request(app.getHttpServer())
        .get('/experts/tags')
        .expect(200);

      expect(res.body).toHaveLength(2);
    });
  });

  // ── GET /experts/:id (public) ─────────────────────────────────────────────────

  describe('GET /experts/:id', () => {
    it('should return expert detail by UUID', async () => {
      prismaMock.expertProfile.findFirst.mockResolvedValue(mockPublicProfile);

      const res = await request(app.getHttpServer())
        .get(`/experts/${MOCK_EXPERT_PROFILE_ID}`)
        .expect(200);

      expect(res.body).toMatchObject({ id: MOCK_EXPERT_PROFILE_ID });
    });

    it('should return 404 when expert does not exist', async () => {
      prismaMock.expertProfile.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get(`/experts/${MOCK_EXPERT_PROFILE_ID}`)
        .expect(404);
    });

    it('should return 400 when id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .get('/experts/gecersiz-id')
        .expect(400);
    });
  });

  // ── GET /experts/me/profile (UZMAN) ──────────────────────────────────────────

  describe('GET /experts/me/profile', () => {
    it('should return my profile for authenticated UZMAN', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(mockExpertProfile());

      const res = await request(app.getHttpServer())
        .get('/experts/me/profile')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(200);

      expect(res.body).toHaveProperty('id', MOCK_EXPERT_PROFILE_ID);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/experts/me/profile')
        .expect(401);
    });

    it('should return 403 when DANISAN tries to access UZMAN profile endpoint', async () => {
      await request(app.getHttpServer())
        .get('/experts/me/profile')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(403);
    });
  });

  // ── GET /experts/me/availabilities (UZMAN) ────────────────────────────────────

  describe('GET /experts/me/availabilities', () => {
    it('should return availability slots for UZMAN', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(mockExpertProfile());
      prismaMock.availability.findMany.mockResolvedValue([
        { id: AVAIL_ID, dayOfWeek: 0, startTime: '09:00', endTime: '12:00', isBlockedByAdmin: false, expertProfileId: MOCK_EXPERT_PROFILE_ID },
      ]);

      const res = await request(app.getHttpServer())
        .get('/experts/me/availabilities')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/experts/me/availabilities')
        .expect(401);
    });
  });

  // ── POST /experts/me/availabilities (UZMAN) ───────────────────────────────────

  describe('POST /experts/me/availabilities', () => {
    const validSlot = { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' };

    it('should add availability slot for UZMAN', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(mockExpertProfile());
      prismaMock.availability.create.mockResolvedValue({
        id: AVAIL_ID,
        ...validSlot,
        isBlockedByAdmin: false,
        expertProfileId: MOCK_EXPERT_PROFILE_ID,
      });

      const res = await request(app.getHttpServer())
        .post('/experts/me/availabilities')
        .set('Authorization', bearerHeader(uzmanToken()))
        .send(validSlot)
        .expect(201);

      expect(res.body).toHaveProperty('id', AVAIL_ID);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/experts/me/availabilities')
        .send(validSlot)
        .expect(401);
    });

    it('should return 403 when DANISAN tries to add availability', async () => {
      await request(app.getHttpServer())
        .post('/experts/me/availabilities')
        .set('Authorization', bearerHeader(danisanToken()))
        .send(validSlot)
        .expect(403);
    });
  });

  // ── DELETE /experts/me/availabilities/:id (UZMAN) ────────────────────────────

  describe('DELETE /experts/me/availabilities/:id', () => {
    it('should delete availability slot', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(mockExpertProfile());
      prismaMock.availability.findUnique.mockResolvedValue({
        id: AVAIL_ID,
        expertProfileId: MOCK_EXPERT_PROFILE_ID,
      });
      prismaMock.availability.delete.mockResolvedValue({ id: AVAIL_ID });

      const res = await request(app.getHttpServer())
        .delete(`/experts/me/availabilities/${AVAIL_ID}`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(200);

      // service returns { message: 'Slot silindi' }
      expect(res.body).toHaveProperty('message');
    });

    it('should return 403 when slot does not exist (service guards owner/existence together)', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(mockExpertProfile());
      prismaMock.availability.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete(`/experts/me/availabilities/${AVAIL_ID}`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });
  });

  // ── GET /experts/me/sent-requests (DANISAN) ───────────────────────────────────

  describe('GET /experts/me/sent-requests', () => {
    it('should return sent requests for authenticated DANISAN', async () => {
      const mockRequests = [
        {
          id: 'req-id-1111-1111-4111-8111-111111111111',
          userId: MOCK_DANISAN_ID,
          message: 'Gorusmek istiyorum',
          status: 'BEKLEMEDE',
          createdAt: new Date('2024-05-01'),
          expertProfile: {
            id: MOCK_EXPERT_PROFILE_ID,
            title: 'Uzman Klinik Psikolog',
            avatarUrl: null,
            user: { firstName: 'Dr. Ayse', lastName: 'Kara' },
          },
        },
      ];
      prismaMock.expertRequest.findMany.mockResolvedValue(mockRequests);

      const res = await request(app.getHttpServer())
        .get('/experts/me/sent-requests')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ status: 'BEKLEMEDE' });
    });

    it('should return empty array when no requests sent', async () => {
      prismaMock.expertRequest.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/experts/me/sent-requests')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/experts/me/sent-requests')
        .expect(401);
    });

    it('should return 403 when UZMAN tries to access DANISAN endpoint', async () => {
      await request(app.getHttpServer())
        .get('/experts/me/sent-requests')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });
  });

  // ── POST /experts/:id/favorites (DANISAN) ─────────────────────────────────────

  describe('POST /experts/:id/favorites', () => {
    it('should add expert to favorites for DANISAN (upsert semantics)', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(mockExpertProfile());
      prismaMock.favorite.upsert.mockResolvedValue({
        id: 'fav-1111-1111-4111-8111-111111111111',
        userId: MOCK_DANISAN_ID,
        expertProfileId: MOCK_EXPERT_PROFILE_ID,
      });

      const res = await request(app.getHttpServer())
        .post(`/experts/${MOCK_EXPERT_PROFILE_ID}/favorites`)
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(201);

      expect(prismaMock.favorite.upsert).toHaveBeenCalledTimes(1);
    });

    it('should return 404 when expert does not exist', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/experts/${MOCK_EXPERT_PROFILE_ID}/favorites`)
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(404);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .post(`/experts/${MOCK_EXPERT_PROFILE_ID}/favorites`)
        .expect(401);
    });

    it('should return 403 when UZMAN tries to favorite an expert', async () => {
      await request(app.getHttpServer())
        .post(`/experts/${MOCK_EXPERT_PROFILE_ID}/favorites`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });
  });

  // ── DELETE /experts/:id/favorites (DANISAN) ───────────────────────────────────

  describe('DELETE /experts/:id/favorites', () => {
    it('should remove expert from favorites (deleteMany semantics)', async () => {
      prismaMock.favorite.deleteMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .delete(`/experts/${MOCK_EXPERT_PROFILE_ID}/favorites`)
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);

      expect(prismaMock.favorite.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('should return 200 even when not in favorites (deleteMany is idempotent)', async () => {
      prismaMock.favorite.deleteMany.mockResolvedValue({ count: 0 });

      await request(app.getHttpServer())
        .delete(`/experts/${MOCK_EXPERT_PROFILE_ID}/favorites`)
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .delete(`/experts/${MOCK_EXPERT_PROFILE_ID}/favorites`)
        .expect(401);
    });
  });
});
