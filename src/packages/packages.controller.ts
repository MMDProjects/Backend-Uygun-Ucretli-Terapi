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
    return this.prisma.package.findMany({ orderBy: { sessionCount: 'asc' } });
  }
}
