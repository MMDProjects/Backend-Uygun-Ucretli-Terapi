import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SssService } from './sss.service';
import { SssPage } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('sss')
@Public()
@Controller('sss')
export class SssController {
  constructor(private readonly sssService: SssService) {}

  @Get()
  @ApiOperation({ summary: 'SSS listesi', description: 'page parametresi verilmezse tüm sayfaların SSS\'leri döner.' })
  @ApiQuery({ name: 'page', required: false, enum: SssPage, description: 'GENEL | TESTLER | PAKETLER' })
  findAll(@Query('page') page?: SssPage) {
    return this.sssService.findByPage(page);
  }
}
