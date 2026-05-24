import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { TestsService } from './tests.service';
import { SaveResultDto } from './dto/save-result.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('tests')
@Controller('tests')
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Aktif test listesi' })
  findAll() {
    return this.testsService.findAll();
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Test detayı' })
  @ApiParam({ name: 'slug', example: 'beck-anksiyete-olcegi' })
  @ApiResponse({ status: 404, description: 'Test bulunamadı veya aktif değil' })
  findBySlug(@Param('slug') slug: string) {
    return this.testsService.findBySlug(slug);
  }

  @Roles('DANISAN')
  @Post('results')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Test sonucunu kaydet', description: 'Test tamamlandıktan sonra skor özeti kaydedilir.' })
  @ApiResponse({ status: 201, description: 'Sonuç kaydedildi' })
  saveResult(@CurrentUser() user: User, @Body() dto: SaveResultDto) {
    return this.testsService.saveResult(user, dto);
  }

  @Roles('DANISAN')
  @Get('history/me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Test geçmişim', description: 'Giriş yapan danışanın daha önce çözdüğü tüm testler.' })
  getHistory(@CurrentUser() user: User) {
    return this.testsService.getHistory(user.id);
  }
}
