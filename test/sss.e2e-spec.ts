import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SssModule } from '../src/sss/sss.module';
import { createPublicTestApp } from './helpers/create-test-app';
import { buildPrismaMock } from './helpers/prisma-mock';

const mockSssItems = [
  {
    id: 'sss-1',
    question: 'Platform nasÄ±l Ã§alÄ±ÅŸÄ±r?',
    answer: 'Uzman seÃ§ip talep gÃ¶nderirsiniz.',
    page: 'GENEL',
  },
  {
    id: 'sss-2',
    question: 'Gizlilik nasÄ±l korunur?',
    answer: 'KVKK kapsamÄ±nda tÃ¼m veriler ÅŸifrelenir.',
    page: 'GENEL',
  },
  {
    id: 'sss-3',
    question: 'Testler Ã¼cretli mi?',
    answer: 'HayÄ±r, tamamen Ã¼cretsizdir.',
    page: 'TESTLER',
  },
];

describe('SSS (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createPublicTestApp([SssModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // â”€â”€ GET /sss â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /sss', () => {
    it('should return all active SSS when no page filter given', async () => {
      prismaMock.sss.findMany.mockResolvedValue(mockSssItems);

      const res = await request(app.getHttpServer()).get('/sss').expect(200);

      expect(res.body).toHaveLength(3);
      expect(res.body[0]).toHaveProperty('question');
      expect(res.body[0]).toHaveProperty('answer');
    });

    it('should filter by page=GENEL', async () => {
      const genel = mockSssItems.filter((s) => s.page === 'GENEL');
      prismaMock.sss.findMany.mockResolvedValue(genel);

      const res = await request(app.getHttpServer())
        .get('/sss?page=GENEL')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(prismaMock.sss.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ page: 'GENEL' }),
        }),
      );
    });

    it('should filter by page=TESTLER', async () => {
      const testler = mockSssItems.filter((s) => s.page === 'TESTLER');
      prismaMock.sss.findMany.mockResolvedValue(testler);

      const res = await request(app.getHttpServer())
        .get('/sss?page=TESTLER')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].page).toBe('TESTLER');
    });

    it('should return empty array when no active SSS items', async () => {
      prismaMock.sss.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/sss?page=PAKETLER')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should be accessible without auth token (public endpoint)', async () => {
      prismaMock.sss.findMany.mockResolvedValue([]);

      await request(app.getHttpServer()).get('/sss').expect(200);
    });
  });
});
