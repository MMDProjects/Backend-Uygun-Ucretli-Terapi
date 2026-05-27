import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PackagesModule } from '../src/packages/packages.module';
import { createPublicTestApp } from './helpers/create-test-app';
import { buildPrismaMock } from './helpers/prisma-mock';

describe('Packages (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createPublicTestApp([PackagesModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // â”€â”€ GET /packages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /packages', () => {
    it('should return list of packages ordered by sessionCount', async () => {
      const mockPackages = [
        { id: 'pkg-1', name: 'Tekli Seans', sessionCount: 1, price: 800, description: 'Tek seans deneyimi', isActive: true },
        { id: 'pkg-2', name: 'DÃ¶rtlÃ¼ Paket', sessionCount: 4, price: 2800, description: '4 seans paketi', isActive: true },
        { id: 'pkg-3', name: 'Sekizli Paket', sessionCount: 8, price: 5200, description: '8 seans paketi', isActive: true },
      ];
      prismaMock.package.findMany.mockResolvedValue(mockPackages);

      const res = await request(app.getHttpServer())
        .get('/packages')
        .expect(200);

      expect(res.body).toHaveLength(3);
      expect(res.body[0]).toMatchObject({ name: 'Tekli Seans', sessionCount: 1 });
      expect(prismaMock.package.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { sessionCount: 'asc' } }),
      );
    });

    it('should return empty array when no packages exist', async () => {
      prismaMock.package.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/packages')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('should return 200 even without auth token (public endpoint)', async () => {
      prismaMock.package.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/packages')
        .expect(200);
    });
  });

  // â”€â”€ GET /packages/pricing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /packages/pricing', () => {
    it('should return standardPrice and discountedPrice from system settings', async () => {
      prismaMock.systemSetting.findFirst.mockResolvedValue({
        standardPrice: 1500,
        discountedPrice: 1200,
      });

      const res = await request(app.getHttpServer())
        .get('/packages/pricing')
        .expect(200);

      expect(res.body).toEqual({ standardPrice: 1500, discountedPrice: 1200 });
    });

    it('should return default prices (1500/1000) when no system settings found', async () => {
      prismaMock.systemSetting.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/packages/pricing')
        .expect(200);

      expect(res.body).toEqual({ standardPrice: 1500, discountedPrice: 1000 });
    });

    it('should convert Prisma Decimal to number', async () => {
      // Prisma Decimal: Number(decimal) calls valueOf() internally
      prismaMock.systemSetting.findFirst.mockResolvedValue({
        standardPrice: { valueOf: () => 1800 },
        discountedPrice: { valueOf: () => 1400 },
      });

      const res = await request(app.getHttpServer())
        .get('/packages/pricing')
        .expect(200);

      expect(res.body).toEqual({ standardPrice: 1800, discountedPrice: 1400 });
      expect(typeof res.body.standardPrice).toBe('number');
      expect(typeof res.body.discountedPrice).toBe('number');
    });
  });
});
