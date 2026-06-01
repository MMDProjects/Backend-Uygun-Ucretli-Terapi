import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

const DEFAULT_ANNOUNCEMENT_ITEMS = [
  'Admin onaylı, sertifikalı uzman profilleri',
  'Ücretsiz ön görüşme imkânı — WhatsApp üzerinden hemen başla',
  'KVKK uyumlu, güvenli ve gizli platformdur',
  'Her uzman belgelerini danışanlarıyla şeffaf paylaşır',
];

const DEFAULT_WHEEL_SEGMENTS = [
  { label: 'Ön Görüş.', description: 'Ücretsiz ön görüşme hakkı — 20 dk WhatsApp görüşmesi' },
  { label: '%10 İnd.', description: 'İlk seansta %10 indirim fırsatı' },
  { label: 'Tekrar!', description: 'Bu sefer olmadı — bir daha dene!' },
  { label: 'Bedava!', description: 'Ücretsiz ilk seans hakkı kazandın' },
  { label: '%20 İnd.', description: 'İlk seansta %20 indirim fırsatı' },
  { label: 'Sürpriz!', description: 'Özel sürpriz ödül — WhatsApp\'tan talep et' },
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

    const rawSegments = (s?.wheelSegments as { label: string; description: string }[] | null) ?? [];
    const segments = rawSegments.length >= 2 ? rawSegments : DEFAULT_WHEEL_SEGMENTS;

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
      wheelSegments: segments,
    };
  }
}
