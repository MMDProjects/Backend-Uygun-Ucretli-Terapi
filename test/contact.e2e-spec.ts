import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ContactModule } from '../src/contact/contact.module';
import { createPublicTestApp } from './helpers/create-test-app';
import { buildPrismaMock } from './helpers/prisma-mock';

const validContactPayload = {
  fullName: 'Ahmet YÄ±lmaz',
  email: 'ahmet@example.com',
  phone: '05321234567',
  subject: 'SORU_SORUN',
  message: 'Platform hakkÄ±nda bir sorum var, yardÄ±mcÄ± olabilir misiniz?',
};

describe('Contact (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createPublicTestApp([ContactModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // â”€â”€ POST /contact â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /contact', () => {
    it('should create contact form and return message + id', async () => {
      const mockForm = { id: 'form-uuid-1', ...validContactPayload, createdAt: new Date() };
      prismaMock.contactForm.create.mockResolvedValue(mockForm);

      const res = await request(app.getHttpServer())
        .post('/contact')
        .send(validContactPayload)
        .expect(201);

      expect(res.body).toHaveProperty('id', 'form-uuid-1');
      expect(prismaMock.contactForm.create).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when email is invalid', async () => {
      await request(app.getHttpServer())
        .post('/contact')
        .send({ ...validContactPayload, email: 'gecersiz-email' })
        .expect(400);

      expect(prismaMock.contactForm.create).not.toHaveBeenCalled();
    });

    it('should return 400 when required fullName is missing', async () => {
      const { fullName: _, ...withoutName } = validContactPayload;

      await request(app.getHttpServer())
        .post('/contact')
        .send(withoutName)
        .expect(400);
    });

    it('should return 400 when message is missing', async () => {
      const { message: _, ...withoutMessage } = validContactPayload;

      await request(app.getHttpServer())
        .post('/contact')
        .send(withoutMessage)
        .expect(400);
    });

    it('should return 400 when phone format is invalid', async () => {
      await request(app.getHttpServer())
        .post('/contact')
        .send({ ...validContactPayload, phone: '123' }) // Ã§ok kÄ±sa
        .expect(400);
    });

    it('should return 400 when subject enum is invalid', async () => {
      await request(app.getHttpServer())
        .post('/contact')
        .send({ ...validContactPayload, subject: 'GECERSIZ_KONU' })
        .expect(400);
    });

    it('should handle corporate contact with optional companyName', async () => {
      const corpPayload = {
        ...validContactPayload,
        isCorporate: true,
        companyName: 'ABC A.Å.',
        employeeCount: '50-100',
      };
      const mockForm = { id: 'form-uuid-2', ...corpPayload, createdAt: new Date() };
      prismaMock.contactForm.create.mockResolvedValue(mockForm);

      const res = await request(app.getHttpServer())
        .post('/contact')
        .send(corpPayload)
        .expect(201);

      expect(res.body.id).toBe('form-uuid-2');
    });

    it('should be accessible without auth token (public endpoint)', async () => {
      prismaMock.contactForm.create.mockResolvedValue({ id: 'x', ...validContactPayload });

      await request(app.getHttpServer())
        .post('/contact')
        .send(validContactPayload)
        .expect(201);
    });
  });
});
