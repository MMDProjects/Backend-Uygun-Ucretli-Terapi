/**
 * Paylaşılan Prisma mock factory.
 * Her test dosyası `buildPrismaMock()` ile kendi izole mock'unu oluşturur.
 * `jest.clearAllMocks()` ile beforeEach'te sıfırlanabilir.
 */
export function buildPrismaMock() {
  return {
    // ── Core models ──────────────────────────────────────────────────────────
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
    expertProfile: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    availability: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    expertRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    favorite: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    // ── Tests ─────────────────────────────────────────────────────────────────
    test: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    testResult: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    // ── Blogs ─────────────────────────────────────────────────────────────────
    blog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    // ── Comments ─────────────────────────────────────────────────────────────
    comment: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    // ── Packages & Settings ───────────────────────────────────────────────────
    package: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    systemSetting: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    // ── SSS ───────────────────────────────────────────────────────────────────
    sss: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    // ── Contact ───────────────────────────────────────────────────────────────
    contactForm: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    // ── Newsletter ────────────────────────────────────────────────────────────
    newsletter: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    // ── Notifications ─────────────────────────────────────────────────────────
    notification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    // ── Forum ─────────────────────────────────────────────────────────────────
    forumQuestion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    forumAnswer: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    // ── Tags ─────────────────────────────────────────────────────────────────
    tag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    // ── Transactions ──────────────────────────────────────────────────────────
    $transaction: jest.fn().mockImplementation((args: unknown) => {
      if (Array.isArray(args)) return Promise.all(args);
      if (typeof args === 'function') return args({ ...buildPrismaMockShallow() });
      return Promise.resolve([]);
    }),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

/** Shallow mock used only inside $transaction callback fallback */
function buildPrismaMockShallow() {
  return {
    expertProfile: { count: jest.fn().mockResolvedValue(0) },
    blog: { count: jest.fn().mockResolvedValue(0) },
    comment: { count: jest.fn().mockResolvedValue(0) },
    forumQuestion: { count: jest.fn().mockResolvedValue(0) },
    expertRequest: { count: jest.fn().mockResolvedValue(0) },
  };
}

// ── Fixture helpers ────────────────────────────────────────────────────────────

// Valid UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
export const MOCK_DANISAN_ID        = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const MOCK_UZMAN_ID          = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const MOCK_ADMIN_ID          = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const MOCK_EXPERT_PROFILE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export function mockDanisanUser(overrides = {}) {
  return {
    id: MOCK_DANISAN_ID,
    firstName: 'Ahmet',
    lastName: 'Yılmaz',
    email: 'danisan@test.com',
    phone: '05321234567',
    passwordHash: '$2b$12$uPJZhTNGUjFqAFDUHT5X4.WSlq6dvqBJPQhcjCWBYA1J0/JT3Tgfe', // placeholder
    role: 'DANISAN',
    isActive: true,
    kvkkConsent: true,
    newsletterConsent: false,
    passwordResetToken: null,
    passwordResetExpires: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function mockUzmanUser(overrides = {}) {
  return {
    id: MOCK_UZMAN_ID,
    firstName: 'Dr. Ayşe',
    lastName: 'Kara',
    email: 'uzman@test.com',
    phone: '05331234567',
    passwordHash: '$2b$12$placeholder',
    role: 'UZMAN',
    isActive: true,
    kvkkConsent: true,
    newsletterConsent: false,
    passwordResetToken: null,
    passwordResetExpires: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function mockAdminUser(overrides = {}) {
  return {
    id: MOCK_ADMIN_ID,
    firstName: 'Admin',
    lastName: 'Kullanıcı',
    email: 'admin@test.com',
    phone: '05001234567',
    passwordHash: '$2b$12$placeholder',
    role: 'ADMIN',
    isActive: true,
    kvkkConsent: true,
    newsletterConsent: false,
    passwordResetToken: null,
    passwordResetExpires: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function mockExpertProfile(overrides = {}) {
  return {
    id: MOCK_EXPERT_PROFILE_ID,
    userId: MOCK_UZMAN_ID,
    title: 'Uzman Klinik Psikolog',
    bio: null,
    avatarUrl: null,
    certificateUrl: '/uploads/certificates/cert.pdf',
    cvUrl: '/uploads/cvs/cv.pdf',
    status: 'YAYINDA',
    priorityScore: 50,
    education: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}
