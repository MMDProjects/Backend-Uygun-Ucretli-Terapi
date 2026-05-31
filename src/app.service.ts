import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getPublicSettings() {
    const s = await this.prisma.systemSetting.findFirst();
    if (!s) return { standardPrice: 1500, discountedPrice: 1000, announcementItems: [] };
    return {
      standardPrice: Number(s.standardPrice),
      discountedPrice: Number(s.discountedPrice),
      whatsappNumber: s.whatsappNumber,
      announcementItems: (s.announcementItems as string[]) ?? [],
    };
  }
}
