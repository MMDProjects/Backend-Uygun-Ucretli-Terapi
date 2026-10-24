import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AdminModule } from '../src/admin/admin.module';
import { createAuthTestApp } from './helpers/create-test-app';
import { buildPrismaMock } from './helpers/prisma-mock';
import { adminToken, uzmanToken, bearerHeader } from './helpers/auth.helper';

// Liste uçları tek $transaction içinde [veri, toplam] döner
const LIST_RESULT = [[], 0];

describe('Admin liste uçları (e2e)', () => {
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
  });

  // ── Yetkilendirme ─────────────────────────────────────────────────────────────

  describe('Rol ve token kontrolü', () => {
    it.each([
      ['/admin/users'],
      ['/admin/test-results'],
      ['/admin/contact-forms'],
    ])('%s: ADMIN 200, UZMAN 403, token yok 401', async (path: string) => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);

      await request(app.getHttpServer()).get(path).expect(401);
    });
  });

  // ── GET /admin/users ──────────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('bozuk limit ve page değerlerinde varsayılana döner', async () => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/users?limit=abc&page=0')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 0 }),
      );
    });

    it('limit en fazla 100 olur', async () => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/users?limit=100000')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('status=inactive isActive false filtresi uygular', async () => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/users?status=inactive')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('geçersiz status değerinde 400 döner', async () => {
      await request(app.getHttpServer())
        .get('/admin/users?status=xyz')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(400);
    });
  });

  // ── GET /admin/experts ────────────────────────────────────────────────────────

  describe('GET /admin/experts', () => {
    it('queue=applications başvuru kuyruğunun where koşullarını uygular', async () => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/experts?queue=applications')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.expertProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ status: 'ONAY_BEKLIYOR', isPublished: false }] },
        }),
      );
    });

    it('geçersiz queue değerinde 400 döner', async () => {
      await request(app.getHttpServer())
        .get('/admin/experts?queue=xyz')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(400);
    });

    it('search parametresi ad, soyad ve e-postada büyük/küçük harf duyarsız arar', async () => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/experts?search=ali')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.expertProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                user: {
                  OR: [
                    {
                      firstName: { contains: 'ali', mode: 'insensitive' },
                    },
                    { lastName: { contains: 'ali', mode: 'insensitive' } },
                    { email: { contains: 'ali', mode: 'insensitive' } },
                  ],
                },
              },
            ],
          },
        }),
      );
    });
  });

  // ── GET /admin/blogs ──────────────────────────────────────────────────────────

  describe('GET /admin/blogs', () => {
    it('queue=approvals onay bekleyen ve revize gönderilen blogları getirir', async () => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/blogs?queue=approvals')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.blog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                status: { in: ['ONAY_BEKLIYOR', 'REVIZE_GONDERILDI'] },
              },
            ],
          },
        }),
      );
    });

    it('status=YAYINDA durum filtresi uygular', async () => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/blogs?status=YAYINDA')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.blog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ status: 'YAYINDA' }] },
        }),
      );
    });

    it('geçersiz status değerinde 400 döner', async () => {
      await request(app.getHttpServer())
        .get('/admin/blogs?status=xyz')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(400);
    });
  });

  // ── GET /admin/contact-forms ──────────────────────────────────────────────────

  describe('GET /admin/contact-forms', () => {
    it('isCorporate ve status filtrelerini birlikte uygular', async () => {
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/contact-forms?isCorporate=true&status=YENI')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.contactForm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isCorporate: true, status: { in: ['YENI'] } },
        }),
      );
    });

    it('geçersiz isCorporate değerinde 400 döner', async () => {
      await request(app.getHttpServer())
        .get('/admin/contact-forms?isCorporate=evet')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(400);
    });
  });

  // ── GET /admin/forum/questions ────────────────────────────────────────────────

  describe('GET /admin/forum/questions', () => {
    it('geçersiz status değerinde 400 döner (500 değil)', async () => {
      await request(app.getHttpServer())
        .get('/admin/forum/questions?status=xyz')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(400);
    });
  });

  // ── Dashboard sayaçları ile kuyruklar ─────────────────────────────────────────

  describe('Dashboard sayaçları ve kuyruk listeleri', () => {
    it('blog onay sayacı REVIZE_GONDERILDI dahil olmak üzere sayar', async () => {
      prismaMock.$transaction.mockResolvedValue([0, 0, 0, 0, 0, 0, 0, 0]);

      await request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(prismaMock.blog.count).toHaveBeenCalledWith({
        where: { status: { in: ['ONAY_BEKLIYOR', 'REVIZE_GONDERILDI'] } },
      });
    });

    it('sayaç ve kuyruk listesi aynı where koşullarını kullanır', async () => {
      prismaMock.$transaction.mockResolvedValue([0, 0, 0, 0, 0, 0, 0, 0]);

      await request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      // Dashboard sayım sırası: applications, profileUpdates; blogs sayımı
      const expertCountWhere = prismaMock.expertProfile.count.mock.calls[0][0]
        .where as Record<string, unknown>;
      const blogCountWhere = prismaMock.blog.count.mock.calls[0][0]
        .where as Record<string, unknown>;

      jest.clearAllMocks();
      prismaMock.$transaction.mockResolvedValue(LIST_RESULT);

      await request(app.getHttpServer())
        .get('/admin/experts?queue=applications')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      await request(app.getHttpServer())
        .get('/admin/blogs?queue=approvals')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      const expertListWhere =
        prismaMock.expertProfile.findMany.mock.calls[0][0].where.AND[0];
      const blogListWhere =
        prismaMock.blog.findMany.mock.calls[0][0].where.AND[0];

      expect(expertListWhere).toEqual(expertCountWhere);
      expect(blogListWhere).toEqual(blogCountWhere);
    });
  });
});
