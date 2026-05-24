import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Admin kullanıcı
  const adminHash = await bcrypt.hash('Admin123!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@psiko.com' },
    update: {},
    create: {
      firstName: 'Sistem',
      lastName: 'Admin',
      email: 'admin@psiko.com',
      phone: '05000000000',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  // Varsayılan etiketler
  const tags = [
    'Anksiyete',
    'Depresyon',
    'İlişki Sorunları',
    'Travma ve TSSB',
    'Aile Terapisi',
    'Çocuk ve Ergen Psikolojisi',
    'Stres Yönetimi',
    'Bağımlılık',
    'Yas ve Kayıp',
    'Öfke Kontrolü',
    'Özgüven',
    'Yeme Bozuklukları',
    'Uyku Sorunları',
    'Panik Atak',
    'OKB',
  ];

  for (const name of tags) {
    await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 5 sabit paket
  const packages = [
    { name: 'Başlangıç Paketi', sessionCount: 1, price: 800, description: 'Tek seferlik keşif seansı. Terapiste ilk adımı atmak isteyenler için idealdir.' },
    { name: 'Temel Paket', sessionCount: 4, price: 2800, description: '4 seanslık temel destek paketi. Belirli bir konuyu kısa sürede ele almak için uygundur.' },
    { name: 'Standart Paket', sessionCount: 8, price: 5200, description: '8 seanslık kapsamlı terapi paketi. Süregelen sorunlar için önerilen paket.' },
    { name: 'Yoğun Paket', sessionCount: 12, price: 7200, description: '12 seanslık yoğun terapi süreci. Derinlemesine çalışma gerektiren durumlar için.' },
    { name: 'Premium Paket', sessionCount: 20, price: 11000, description: '20 seanslık uzun vadeli terapi programı. Kalıcı değişim hedefleyenler için.' },
  ];

  for (const pkg of packages) {
    const existing = await prisma.package.findFirst({ where: { name: pkg.name } });
    if (!existing) {
      await prisma.package.create({ data: pkg });
    }
  }

  // Sistem ayarları
  const settingCount = await prisma.systemSetting.count();
  if (settingCount === 0) {
    await prisma.systemSetting.create({
      data: {
        whatsappNumber: '+905000000000',
        instagramUrl: 'https://instagram.com/psikodanismanlik',
        standardPrice: 1500,
        discountedPrice: 1000,
        logoUrl: '/uploads/logo.png',
        videoUrl: null,
      },
    });
  }

  console.log('Seed tamamlandı.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
