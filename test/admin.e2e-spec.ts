import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';

import { AdminModule } from '../src/admin/admin.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import {
  buildPrismaMock,
  MOCK_ADMIN_ID,
  MOCK_EXPERT_PROFILE_ID,
  mockAdminUser,
  mockUzmanUser,
  mockDanisanUser,
  MOCK_DANISAN_ID,
  MOCK_UZMAN_ID,
} from './helpers/prisma-mock';
import { adminToken, danisanToken, uzmanToken, bearerHeader, TEST_JWT_SECRET } from './helpers/auth.helper';

process.env.JWT_ACCESS_SECRET   = TEST_JWT_SECRET;
process.env.JWT_REFRESH_SECRET  = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES  = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';

// Valid UUID v4: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
const BLOG_UUID = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const SSS_UUID  = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';
const PKG_UUID  = 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3';
const TAG_UUID  = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let prismaMock: ReturnType<typeof buildPrismaMock>;

  const mailMock = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendContactConfirmation: jest.fn().mockResolvedValue(undefined),
    sendWelcome: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    prismaMock = buildPrismaMock();

    // JWT doÄŸrulama iÃ§in user.findUnique â€” rol tabanlÄ± mock
    prismaMock.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id === MOCK_ADMIN_ID)   return Promise.resolve(mockAdminUser());
        if (where.id === MOCK_UZMAN_ID)   return Promise.resolve(mockUzmanUser());
        if (where.id === MOCK_DANISAN_ID) return Promise.resolve(mockDanisanUser());
        return Promise.resolve(null);
      },
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,   // @Global() — overrideProvider replaces PrismaService
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({}),
        AdminModule,
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(MailService)
      .useValue(mailMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // JWT mock restore (clearAllMocks sÄ±fÄ±rlar)
    prismaMock.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string } }) => {
        if (where.id === MOCK_ADMIN_ID)   return Promise.resolve(mockAdminUser());
        if (where.id === MOCK_UZMAN_ID)   return Promise.resolve(mockUzmanUser());
        if (where.id === MOCK_DANISAN_ID) return Promise.resolve(mockDanisanUser());
        return Promise.resolve(null);
      },
    );
  });

  // â”€â”€ GET /admin/dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /admin/dashboard', () => {
    it('should return dashboard stats for ADMIN', async () => {
      prismaMock.$transaction.mockResolvedValue([3, 2, 5, 1, 7]);

      const res = await request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toMatchObject({
        pendingExperts: 3,
        pendingBlogs: 2,
        pendingComments: 5,
        pendingQuestions: 1,
        newRequests: 7,
      });
    });

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/admin/dashboard')
        .expect(401);
    });

    it('should return 403 when UZMAN tries to access admin endpoint', async () => {
      await request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });

    it('should return 403 when DANISAN tries to access admin endpoint', async () => {
      await request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(403);
    });
  });

  // â”€â”€ GET /admin/experts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /admin/experts', () => {
    it('should return paginated expert list', async () => {
      const mockExpert = {
        id: MOCK_EXPERT_PROFILE_ID,
        title: 'Uzman Klinik Psikolog',
        status: 'YAYINDA',
        user: { firstName: 'Dr. AyÅŸe', lastName: 'Kara', email: 'uzman@test.com', phone: '05331234567' },
        tags: [],
      };
      prismaMock.$transaction.mockResolvedValue([[mockExpert], 1]);

      const res = await request(app.getHttpServer())
        .get('/admin/experts')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total', 1);
    });
  });

  // â”€â”€ PATCH /admin/experts/:id/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('PATCH /admin/experts/:id/status', () => {
    it('should approve an expert profile', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue({
        id: MOCK_EXPERT_PROFILE_ID,
        status: 'ONAY_BEKLIYOR',
        userId: MOCK_UZMAN_ID,
      });
      prismaMock.expertProfile.update.mockResolvedValue({
        id: MOCK_EXPERT_PROFILE_ID,
        status: 'YAYINDA',
      });
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-1' });

      const res = await request(app.getHttpServer())
        .patch(`/admin/experts/${MOCK_EXPERT_PROFILE_ID}/status`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ status: 'YAYINDA' })
        .expect(200);

      expect(prismaMock.expertProfile.update).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when rejecting without adminNote', async () => {
      await request(app.getHttpServer())
        .patch(`/admin/experts/${MOCK_EXPERT_PROFILE_ID}/status`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ status: 'REDDEDILDI' }) // adminNote eksik
        .expect(400);
    });

    it('should reject expert profile with adminNote provided', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue({
        id: MOCK_EXPERT_PROFILE_ID,
        userId: MOCK_UZMAN_ID,
      });
      prismaMock.expertProfile.update.mockResolvedValue({ id: MOCK_EXPERT_PROFILE_ID, status: 'REDDEDILDI' });
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-2' });

      await request(app.getHttpServer())
        .patch(`/admin/experts/${MOCK_EXPERT_PROFILE_ID}/status`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ status: 'REDDEDILDI', adminNote: 'Belgeler eksik' })
        .expect(200);
    });

    it('should return 404 when expert profile not found', async () => {
      prismaMock.expertProfile.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch(`/admin/experts/${MOCK_EXPERT_PROFILE_ID}/status`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ status: 'YAYINDA' })
        .expect(404);
    });
  });

  // â”€â”€ GET /admin/blogs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /admin/blogs', () => {
    it('should return all blogs (including pending) for admin', async () => {
      prismaMock.$transaction.mockResolvedValue([
        [{ id: BLOG_UUID, title: 'Test Blog', status: 'ONAY_BEKLIYOR' }],
        1,
      ]);

      const res = await request(app.getHttpServer())
        .get('/admin/blogs')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body.data[0]).toHaveProperty('status', 'ONAY_BEKLIYOR');
    });

    it('should return 403 when UZMAN tries to access', async () => {
      await request(app.getHttpServer())
        .get('/admin/blogs')
        .set('Authorization', bearerHeader(uzmanToken()))
        .expect(403);
    });
  });

  // â”€â”€ PATCH /admin/blogs/:id/status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('PATCH /admin/blogs/:id/status', () => {
    it('should approve a blog', async () => {
      prismaMock.blog.findUnique.mockResolvedValue({
        id: BLOG_UUID,
        status: 'ONAY_BEKLIYOR',
        expertProfileId: MOCK_EXPERT_PROFILE_ID,
        expertProfile: { userId: MOCK_UZMAN_ID },
      });
      prismaMock.blog.update.mockResolvedValue({ id: BLOG_UUID, status: 'YAYINDA' });
      prismaMock.notification.create.mockResolvedValue({ id: 'notif-3' });

      await request(app.getHttpServer())
        .patch(`/admin/blogs/${BLOG_UUID}/status`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ status: 'YAYINDA' })
        .expect(200);
    });

    it('should return 404 when blog not found', async () => {
      prismaMock.blog.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch(`/admin/blogs/${BLOG_UUID}/status`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ status: 'YAYINDA' })
        .expect(404);
    });
  });

  // â”€â”€ GET /admin/requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /admin/requests', () => {
    it('should return paginated expert requests', async () => {
      prismaMock.$transaction.mockResolvedValue([
        [{ id: 'req-1', status: 'BEKLEMEDE' }],
        1,
      ]);

      const res = await request(app.getHttpServer())
        .get('/admin/requests')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    it('should return 403 for non-admin users', async () => {
      await request(app.getHttpServer())
        .get('/admin/requests')
        .set('Authorization', bearerHeader(danisanToken()))
        .expect(403);
    });
  });

  // â”€â”€ PUT /admin/packages/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('PUT /admin/packages/:id', () => {
    it('should update package details', async () => {
      prismaMock.package.findUnique.mockResolvedValue({
        id: PKG_UUID,
        name: 'Mevcut Paket',
        sessionCount: 1,
        price: 1800,
        isActive: true,
      });
      prismaMock.package.update.mockResolvedValue({
        id: PKG_UUID,
        name: 'Guncellenmis Paket',
        sessionCount: 4,
        price: 3200,
        description: 'Yeni aciklama',
        isActive: true,
      });

      const res = await request(app.getHttpServer())
        .put(`/admin/packages/${PKG_UUID}`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ name: 'Guncellenmis Paket', sessionCount: 4, price: 3200 })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Guncellenmis Paket' });
    });

    it('should return 400 when sessionCount is not positive', async () => {
      await request(app.getHttpServer())
        .put(`/admin/packages/${PKG_UUID}`)
        .set('Authorization', bearerHeader(adminToken()))
        .send({ sessionCount: -1 })
        .expect(400);
    });
  });

  // â”€â”€ POST /admin/sss â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /admin/sss', () => {
    const validSss = {
      question: 'Platform nasÄ±l Ã§alÄ±ÅŸÄ±r?',
      answer: 'Uzman seÃ§erek talep gÃ¶nderirsiniz.',
      page: 'GENEL',
      isActive: true,
      order: 1,
    };

    it('should create a new SSS entry', async () => {
      prismaMock.sss.create.mockResolvedValue({ id: SSS_UUID, ...validSss });

      const res = await request(app.getHttpServer())
        .post('/admin/sss')
        .set('Authorization', bearerHeader(adminToken()))
        .send(validSss)
        .expect(201);

      expect(prismaMock.sss.create).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when question is missing', async () => {
      const { question: _, ...withoutQuestion } = validSss;

      await request(app.getHttpServer())
        .post('/admin/sss')
        .set('Authorization', bearerHeader(adminToken()))
        .send(withoutQuestion)
        .expect(400);
    });

    it('should return 400 when page enum is invalid', async () => {
      await request(app.getHttpServer())
        .post('/admin/sss')
        .set('Authorization', bearerHeader(adminToken()))
        .send({ ...validSss, page: 'GECERSIZ_SAYFA' })
        .expect(400);
    });
  });

  // â”€â”€ POST /admin/notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /admin/notifications', () => {
    const validNotif = {
      userId: MOCK_UZMAN_ID,
      type: 'INFO',
      message: 'Profilinizi guncellemeniz gerekmektedir.',
    };

    it('should send notification to a user', async () => {
      prismaMock.notification.create.mockResolvedValue({
        id: 'notif-admin-1',
        ...validNotif,
        isRead: false,
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post('/admin/notifications')
        .set('Authorization', bearerHeader(adminToken()))
        .send(validNotif)
        .expect(201);

      expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    });

    it('should return 400 when userId is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .post('/admin/notifications')
        .set('Authorization', bearerHeader(adminToken()))
        .send({ ...validNotif, userId: 'gecersiz-uuid' })
        .expect(400);
    });

    it('should return 400 when message is missing', async () => {
      const { message: _, ...withoutMessage } = validNotif;

      await request(app.getHttpServer())
        .post('/admin/notifications')
        .set('Authorization', bearerHeader(adminToken()))
        .send(withoutMessage)
        .expect(400);
    });
  });

  // â”€â”€ GET /admin/tags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('GET /admin/tags', () => {
    it('should return all tags for admin', async () => {
      prismaMock.tag.findMany.mockResolvedValue([
        { id: TAG_UUID, name: 'Anksiyete', isActive: true },
        { id: 'tag-2', name: 'Depresyon', isActive: false },
      ]);

      const res = await request(app.getHttpServer())
        .get('/admin/tags')
        .set('Authorization', bearerHeader(adminToken()))
        .expect(200);

      expect(res.body).toHaveLength(2);
    });
  });

  // â”€â”€ POST /admin/tags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('POST /admin/tags', () => {
    it('should create a new tag', async () => {
      prismaMock.tag.create.mockResolvedValue({ id: TAG_UUID, name: 'Yas', isActive: true });

      const res = await request(app.getHttpServer())
        .post('/admin/tags')
        .set('Authorization', bearerHeader(adminToken()))
        .send({ name: 'Yas' })
        .expect(201);

      expect(prismaMock.tag.create).toHaveBeenCalledTimes(1);
    });
  });
});
