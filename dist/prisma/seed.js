"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
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
//# sourceMappingURL=seed.js.map