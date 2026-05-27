import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NewsletterModule } from '../src/newsletter/newsletter.module';
import { createPublicTestApp } from './helpers/create-test-app';
import { buildPrismaMock } from './helpers/prisma-mock';

describe('Newsletter (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createPublicTestApp([NewsletterModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // â”€â”€ POST /newsletter/subscribe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /newsletter/subscribe', () => {
    it('should subscribe a new email and return success message', async () => {
      prismaMock.newsletter.findUnique.mockResolvedValue(null); // yeni e-posta
      prismaMock.newsletter.create.mockResolvedValue({
        id: 'nl-1',
        email: 'yeni@abone.com',
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/newsletter/subscribe')
        .send({ email: 'yeni@abone.com' })
        .expect(201);

      expect(res.body).toHaveProperty('message');
      expect(typeof res.body.message).toBe('string');
      expect(prismaMock.newsletter.create).toHaveBeenCalledTimes(1);
    });

    it('should return 409 when email is already subscribed', async () => {
      prismaMock.newsletter.findUnique.mockResolvedValue({
        id: 'nl-1',
        email: 'mevcut@abone.com',
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/newsletter/subscribe')
        .send({ email: 'mevcut@abone.com' })
        .expect(409);

      expect(res.body).toHaveProperty('message');
      expect(res.body.statusCode).toBe(409);
      expect(prismaMock.newsletter.create).not.toHaveBeenCalled();
    });

    it('should return 400 when email format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/newsletter/subscribe')
        .send({ email: 'gecersiz-email' })
        .expect(400);

      expect(prismaMock.newsletter.findUnique).not.toHaveBeenCalled();
    });

    it('should return 400 when email is missing', async () => {
      await request(app.getHttpServer())
        .post('/newsletter/subscribe')
        .send({})
        .expect(400);
    });

    it('should be accessible without auth token (public endpoint)', async () => {
      prismaMock.newsletter.findUnique.mockResolvedValue(null);
      prismaMock.newsletter.create.mockResolvedValue({ id: 'nl-2', email: 'test@test.com' });

      await request(app.getHttpServer())
        .post('/newsletter/subscribe')
        .send({ email: 'test@test.com' })
        .expect(201);
    });
  });
});
