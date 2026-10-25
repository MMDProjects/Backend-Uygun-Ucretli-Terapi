import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AdminModule } from '../src/admin/admin.module';
import { createAuthTestApp } from './helpers/create-test-app';
import { buildPrismaMock } from './helpers/prisma-mock';
import { adminToken, bearerHeader } from './helpers/auth.helper';

// ?token= yalnızca SSE akışlarında kabul edilir; diğer uçlarda yok sayılır.
describe('JWT giriş anahtarı kaynağı (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createAuthTestApp([AdminModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockResolvedValue([[], 0]);
  });

  it('GET /admin/users?token= ile 401 doner', async () => {
    await request(app.getHttpServer())
      .get(`/admin/users?token=${adminToken()}`)
      .expect(401);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('GET /admin/users Authorization basligi ile 200 doner', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', bearerHeader(adminToken()))
      .expect(200);
  });
});
