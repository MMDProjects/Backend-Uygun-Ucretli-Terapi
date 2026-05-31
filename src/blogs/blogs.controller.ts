import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseUUIDPipe, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('blogs')
@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Yayındaki blog yazıları (public)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query('page') page = '1', @Query('limit') limit = '10') {
    return this.blogsService.findAllPublic(+page, +limit);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Blog detayı' })
  @ApiParam({ name: 'slug', example: 'anksiyete-ile-basa-cikma-yollari' })
  @ApiResponse({ status: 404, description: 'Blog bulunamadı' })
  findBySlug(@Param('slug') slug: string) {
    return this.blogsService.findBySlug(slug);
  }

  @Roles('UZMAN')
  @Get('me/list')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Kendi bloglarım' })
  getMyBlogs(@CurrentUser() user: User) {
    return this.blogsService.getMyBlogs(user.id);
  }

  @Roles('UZMAN')
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Blog oluştur', description: 'TASLAK statüsünde oluşur, admin onayı gerekir.' })
  @ApiResponse({ status: 201, description: 'Blog oluşturuldu' })
  create(@CurrentUser() user: User, @Body() dto: CreateBlogDto) {
    return this.blogsService.create(user, dto);
  }

  @Roles('UZMAN')
  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Blog güncelle', description: 'Güncelleme ONAY_BEKLIYOR statüsüne düşürür.' })
  @ApiParam({ name: 'id', description: 'Blog UUID' })
  update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreateBlogDto>) {
    return this.blogsService.update(user, id, dto);
  }

  @Roles('UZMAN')
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Blog sil' })
  @ApiParam({ name: 'id', description: 'Blog UUID' })
  delete(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.blogsService.delete(user, id);
  }

  @Roles('UZMAN')
  @Post(':id/cover')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Blog kapak fotoğrafı yükle' })
  @ApiParam({ name: 'id', description: 'Blog UUID' })
  @UseInterceptors(FileInterceptor('cover', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadCover(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.blogsService.uploadCover(user, id, file);
  }
}
