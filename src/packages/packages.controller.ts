import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('packages')
@Public()
@Controller('packages')
export class PackagesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Paket listesi (public)', description: 'Admin tarafından yönetilen 5 paket. Uzman sayfalarında fiyat gösterilmez, sadece bu endpoint kullanılır.' })
  findAll() {
    return this.prisma.package.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  }

  @Get('pricing')
  @ApiOperation({ summary: 'Platform fiyat bilgisi (public)', description: 'Duyuru bandı ve uzman kartı için standardPrice + discountedPrice.' })
  async getPricing() {
    const settings = await this.prisma.systemSetting.findFirst({
      select: { standardPrice: true, discountedPrice: true },
    });
    return {
      standardPrice: settings ? Number(settings.standardPrice) : 1500,
      discountedPrice: settings ? Number(settings.discountedPrice) : 1000,
    };
  }
}
