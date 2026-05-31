import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

const DEFAULT_ANNOUNCEMENT_ITEMS = [
  'Admin onaylı, sertifikalı uzman profilleri',
  'Ücretsiz ön görüşme imkânı — WhatsApp üzerinden hemen başla',
  'KVKK uyumlu, güvenli ve gizli platformdur',
  'Her uzman belgelerini danışanlarıyla şeffaf paylaşır',
];

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getPublicSettings() {
    const s = await this.prisma.systemSetting.findFirst();
    const raw = (s?.announcementItems as string[] | null) ?? [];
    const items = raw.length > 0 ? raw : DEFAULT_ANNOUNCEMENT_ITEMS;

    // Mevcut kayıtta boş array varsa DB'yi de güncelle
    if (s && raw.length === 0) {
      await this.prisma.systemSetting.update({
        where: { id: s.id },
        data: { announcementItems: DEFAULT_ANNOUNCEMENT_ITEMS },
      }).catch(() => {});
    }

    return {
      standardPrice: Number(s?.standardPrice ?? 1500),
      discountedPrice: Number(s?.discountedPrice ?? 1000),
      whatsappNumber: s?.whatsappNumber ?? '',
      announcementItems: items,
    };
  }
}
