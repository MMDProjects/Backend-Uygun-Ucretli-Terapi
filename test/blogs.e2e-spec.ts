import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BlogsModule } from '../src/blogs/blogs.module';
import { createAuthTestApp } from './helpers/create-test-app';
import { buildPrismaMock, MOCK_UZMAN_ID, MOCK_EXPERT_PROFILE_ID, mockExpertProfile } from './helpers/prisma-mock';
import { uzmanToken, danisanToken, bearerHeader } from './helpers/auth.helper';

// Valid UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
const BLOG_ID = 'b1a1b1a1-b1a1-4b1a-8b1a-b1a1b1a1b1a1';

const mockPublicBlog = {
  id: BLOG_ID,
  title: 'Anksiyete ile Bas Cikma Yollari',
  slug: 'anksiyete-ile-basa-cikma',
  content: 'Anksiyete modern dunyanin en yaygin sorunlarindan biridir...',
  status: 'YAYINDA',
  expertProfileId: MOCK_EXPERT_PROFILE_ID,
  createdAt: new Date('2024-03-01'),
  expertProfile: {
    id: MOCK_EXPERT_PROFILE_ID,
    title: 'Uzman Klinik Psikolog',
    avatarUrl: null,
    userId: MOCK_UZMAN_ID,
    user: { firstName: 'Dr. Ayse', lastName: 'Kara' },
  },
};

describe('Blogs (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  beforeAll(async () => {
    ({ app, prismaMock } = await createAuthTestApp([BlogsModule]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /blogs (public) ────────────────────────────────────────────────────────

  describe('GET /blogs', () => {
    it('should return published blogs with pagination', async () => {
      // findAllPublic uses prisma.$transaction([findMany, count])
      prismaMock.$transaction.mockResolvedValue([[mockPublicBlog], 1]);

      const res = await request(app.getHttpServer())
        .get('/blogs')
        .expect(200);

      expect(res.body).toHaveProperty('total', 1);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return empty data when no blogs exist', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      const res = await request(app.getHttpServer())
        .get('/blogs')
        .expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('should be accessible without auth token', async () => {
      prismaMock.$transaction.mockResolvedValue([[], 0]);

      await request(app.getHttpServer())
        .get('/blogs')
        .expect(200);
    });
  });

  // ── GET /blogs/:slug (public) ──────────────────────────────────────────────────

  describe('GET /blogs/:slug', () => {
    it('should return blog detail by slug', async () => {
      prismaMock.blog.findFirst.mockResolvedValue(mockPublicBlog);

      const res = await request(app.getHttpServer())
        .get('/blogs/anksiyete-ile-basa-cikma')
        .expect(200);

      expect(res.body).toMatchObject({ slug: 'anksiyete-ile-basa-cikma' });
    });

    it('should return 404 when blog slug does not exist', async () => {
      prismaMock.blog.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/blogs/olmayan-blog')
        .expect(404);
    });
  });

  // ── GET /blogs/me/list (UZMAN) ────────────────────────────────────────────────

  describe('GET /blogs/me/list', () => {
    it('should return my blogs for authenticated UZMAN', async () => {
      // getMyBlogs calls expertProfile.findUnique first, then blog.findMany
      prismaMock.expertProfile.findUnique.mockResolvedValue(mockExpertProfile());
      prismaMock.blog.findMany.mockResolvedValue([
        { ...mockPublicBlog, status: 'TASLAK' },
      ]);

      const res = await request(app.getHttpServer())
        .get('/blogs/me/list')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/blogs/me/list')
        .expect(401);
    });

    it('should return 403 when DANISAN tries to access UZMAN endpoint', async () => {
      await request(app.getHttpServer())
        .get('/blogs/me/list')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(403);
    });
  });

  // ── POST /blogs (UZMAN) ───────────────────────────────────────────────────────

  describe('POST /blogs', () => {
    const validBlogPayload = {
      title: 'Stres Yonetimi Teknikleri',
      slug: 'stres-yonetimi-teknikleri',
      content: 'Stres, gunluk hayatin kacınilmaz bir parcasidir. '.repeat(3), // 100+ chars
    };

    it('should create a draft blog for authenticated UZMAN', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(mockExpertProfile());
      prismaMock.blog.create.mockResolvedValue({
        id: 'new-blog-id',
        ...validBlogPayload,
        status: 'TASLAK',
        expertProfileId: MOCK_EXPERT_PROFILE_ID,
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/blogs')
        .set('Authorization', bearerHeader(uzmanToken()))
        .send(validBlogPayload)
        .expect(201);

      expect(res.body).toMatchObject({ status: 'TASLAK' });
      expect(prismaMock.blog.create).toHaveBeenCalledTimes(1);
    });

    it('should return 403 if UZMAN has no expert profile', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/blogs')
        .set('Authorization', bearerHeader(uzmanToken()))
        .send(validBlogPayload)
        .expect(403);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .post('/blogs')
        .send(validBlogPayload)
        .expect(401);
    });

    it('should return 400 when title is missing', async () => {
      const { title: _, ...withoutTitle } = validBlogPayload;

      await request(app.getHttpServer())
        .post('/blogs')
        .set('Authorization', bearerHeader(uzmanToken()))
        .send(withoutTitle)
        .expect(400);
    });

    it('should return 403 when DANISAN tries to create blog', async () => {
      await request(app.getHttpServer())
        .post('/blogs')
        .set('Authorization', bearerHeader(danisanToken()))
        .send(validBlogPayload)
        .expect(403);
    });
  });

  // ── PATCH /blogs/:id (UZMAN) ──────────────────────────────────────────────────

  describe('PATCH /blogs/:id', () => {
    it('should update own blog and change status to ONAY_BEKLIYOR', async () => {
      prismaMock.blog.findUnique.mockResolvedValue({
        ...mockPublicBlog,
        expertProfile: { ...mockPublicBlog.expertProfile, userId: MOCK_UZMAN_ID },
      });
      prismaMock.blog.update.mockResolvedValue({
        ...mockPublicBlog,
        title: 'Guncellenmis Baslik',
        status: 'ONAY_BEKLIYOR',
      });

      const res = await request(app.getHttpServer())
        .patch(`/blogs/${BLOG_ID}`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .send({ title: 'Guncellenmis Baslik' })
        .expect(200);

      expect(res.body).toMatchObject({ status: 'ONAY_BEKLIYOR' });
    });

    it('should return 403 when UZMAN tries to update another experts blog', async () => {
      prismaMock.blog.findUnique.mockResolvedValue({
        ...mockPublicBlog,
        expertProfile: { ...mockPublicBlog.expertProfile, userId: 'baska-uzman-id' },
      });

      await request(app.getHttpServer())
        .patch(`/blogs/${BLOG_ID}`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .send({ title: 'Hacking baslik' })
        .expect(403);
    });

    it('should return 404 when blog does not exist', async () => {
      prismaMock.blog.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch(`/blogs/${BLOG_ID}`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .send({ title: 'Baslik' })
        .expect(404);
    });

    it('should return 400 when id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .patch('/blogs/gecersiz-id')
        .set('Authorization', bearerHeader(uzmanToken()))
        .send({ title: 'Baslik' })
        .expect(400);
    });
  });

  // ── DELETE /blogs/:id (UZMAN) ─────────────────────────────────────────────────

  describe('DELETE /blogs/:id', () => {
    it('should delete own blog', async () => {
      prismaMock.blog.findUnique.mockResolvedValue({
        ...mockPublicBlog,
        expertProfile: { ...mockPublicBlog.expertProfile, userId: MOCK_UZMAN_ID },
      });
      prismaMock.blog.delete.mockResolvedValue(mockPublicBlog);

      const res = await request(app.getHttpServer())
        .delete(`/blogs/${BLOG_ID}`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(200);

      expect(res.body).toMatchObject({ message: 'Blog silindi' });
    });

    it('should return 404 when blog does not exist', async () => {
      prismaMock.blog.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete(`/blogs/${BLOG_ID}`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(404);
    });

    it('should return 403 when trying to delete another experts blog', async () => {
      prismaMock.blog.findUnique.mockResolvedValue({
        ...mockPublicBlog,
        expertProfile: { ...mockPublicBlog.expertProfile, userId: 'baska-uzman-id' },
      });

      await request(app.getHttpServer())
        .delete(`/blogs/${BLOG_ID}`)
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });
  });
});
