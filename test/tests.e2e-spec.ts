import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TestsModule } from '../src/tests/tests.module';
import { createAuthTestApp } from './helpers/create-test-app';
import { buildPrismaMock, MOCK_DANISAN_ID } from './helpers/prisma-mock';
import { danisanToken, uzmanToken, bearerHeader } from './helpers/auth.helper';

const mockTests = [
  {
    id: 'test-1',
    title: 'Beck Anksiyete Ã–lÃ§eÄŸi',
    slug: 'beck-anksiyete-olcegi',
    description: 'Anksiyete belirtilerini Ã¶lÃ§er.',
    isActive: true,
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 'test-2',
    title: 'Beck Depresyon Ã–lÃ§eÄŸi',
    slug: 'beck-depresyon-olcegi',
    description: 'Depresyon belirtilerini Ã¶lÃ§er.',
    isActive: true,
    createdAt: new Date('2024-01-01'),
  },
];

describe('Tests (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createAuthTestApp([TestsModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // â”€â”€ GET /tests (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /tests', () => {
    it('should return active tests without auth', async () => {
      prismaMock.test.findMany.mockResolvedValue(mockTests);

      const res = await request(app.getHttpServer())
        .get('/tests')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty('title', 'Beck Anksiyete Ã–lÃ§eÄŸi');
      expect(prismaMock.test.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('should return empty array when no active tests', async () => {
      prismaMock.test.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/tests')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  // â”€â”€ GET /tests/:slug (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /tests/:slug', () => {
    it('should return test detail by slug', async () => {
      prismaMock.test.findUnique.mockResolvedValue(mockTests[0]);

      const res = await request(app.getHttpServer())
        .get('/tests/beck-anksiyete-olcegi')
        .expect(200);

      expect(res.body).toMatchObject({ slug: 'beck-anksiyete-olcegi' });
    });

    it('should return 404 when slug does not exist', async () => {
      prismaMock.test.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/tests/olmayan-test')
        .expect(404);
    });

    it('should return 404 when test exists but is not active', async () => {
      prismaMock.test.findUnique.mockResolvedValue({ ...mockTests[0], isActive: false });

      await request(app.getHttpServer())
        .get('/tests/beck-anksiyete-olcegi')
        .expect(404);
    });
  });

  // â”€â”€ POST /tests/results (DANISAN) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /tests/results', () => {
    // Valid UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
    const VALID_TEST_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const validPayload = {
      testId: VALID_TEST_UUID,
      scoreSummary: 'Orta duzey anksiyete (Skor: 42/80). Profesyonel destek onerilir.',
    };

    it('should save test result for authenticated DANISAN', async () => {
      prismaMock.test.findUnique.mockResolvedValue(mockTests[0]);
      prismaMock.testResult.create.mockResolvedValue({
        id: 'result-1',
        userId: MOCK_DANISAN_ID,
        testId: VALID_TEST_UUID,
        scoreSummary: validPayload.scoreSummary,
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/tests/results')
        .set('Authorization', bearerHeader(danisanToken()))
        .send(validPayload)
        .expect(201);

      expect(res.body).toHaveProperty('id', 'result-1');
      expect(prismaMock.testResult.create).toHaveBeenCalledTimes(1);
    });

    it('should return 401 when no token provided', async () => {
      await request(app.getHttpServer())
        .post('/tests/results')
        .send(validPayload)
        .expect(401);
    });

    it('should return 403 when UZMAN token is used (role mismatch)', async () => {
      await request(app.getHttpServer())
        .post('/tests/results')
        .set('Authorization', bearerHeader(uzmanToken()))
        .send(validPayload)
        .expect(403);
    });

    it('should return 400 when testId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .post('/tests/results')
        .set('Authorization', bearerHeader(danisanToken()))
        .send({ testId: 'not-a-uuid', scoreSummary: 'test' })
        .expect(400);
    });

    it('should return 400 when scoreSummary is missing', async () => {
      await request(app.getHttpServer())
        .post('/tests/results')
        .set('Authorization', bearerHeader(danisanToken()))
        .send({ testId: VALID_TEST_UUID })
        .expect(400);
    });

    it('should return 404 when testId does not match any test', async () => {
      prismaMock.test.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/tests/results')
        .set('Authorization', bearerHeader(danisanToken()))
        .send({ testId: VALID_TEST_UUID, scoreSummary: 'test ozeti' })
        .expect(404);
    });
  });

  // â”€â”€ GET /tests/history/me (DANISAN) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /tests/history/me', () => {
    it('should return test history for authenticated DANISAN', async () => {
      const mockHistory = [
        {
          id: 'result-1',
          userId: MOCK_DANISAN_ID,
          testId: 'test-1',
          scoreSummary: 'DÃ¼ÅŸÃ¼k anksiyete',
          createdAt: new Date('2024-06-01'),
          test: { title: 'Beck Anksiyete Ã–lÃ§eÄŸi', slug: 'beck-anksiyete-olcegi' },
        },
      ];
      prismaMock.testResult.findMany.mockResolvedValue(mockHistory);

      const res = await request(app.getHttpServer())
        .get('/tests/history/me')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toHaveProperty('scoreSummary', 'DÃ¼ÅŸÃ¼k anksiyete');
    });

    it('should return empty array when no test history', async () => {
      prismaMock.testResult.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/tests/history/me')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return 401 when no token provided', async () => {
      await request(app.getHttpServer())
        .get('/tests/history/me')
        .expect(401);
    });

    it('should return 403 when UZMAN tries to access danisan history', async () => {
      await request(app.getHttpServer())
        .get('/tests/history/me')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });
  });
});
