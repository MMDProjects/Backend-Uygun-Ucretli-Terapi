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
    { name: 'Bireysel', sessionCount: 1, price: 800, description: 'Bireysel terapi seansı. Terapiste ilk adımı atmak isteyenler için idealdir.' },
    { name: 'Çift', sessionCount: 1, price: 1200, description: 'Çift terapisi seansı. İlişki sorunlarını birlikte ele almak için.' },
    { name: 'Aile', sessionCount: 1, price: 1500, description: 'Aile terapisi seansı. Aile dinamiklerini güçlendirmek için.' },
    { name: '5\'li Paket', sessionCount: 5, price: 3500, description: '5 seanslık bireysel terapi paketi. Düzenli destek için idealdir.' },
    { name: '10\'lu Paket', sessionCount: 10, price: 6500, description: '10 seanslık bireysel terapi paketi. Uzun vadeli gelişim için önerilen paket.' },
  ];

  // Mevcut tüm paketleri sil ve yeniden oluştur
  await prisma.package.deleteMany();
  for (const pkg of packages) {
    await prisma.package.create({ data: pkg });
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
