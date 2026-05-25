import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ExpertsService } from './experts.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { FilterExpertsDto } from './dto/filter-experts.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('experts')
@Controller('experts')
export class ExpertsController {
  constructor(private readonly expertsService: ExpertsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Uzman listesi', description: 'Sadece YAYINDA durumundaki uzmanlar döner. Fiyat bilgisi dönmez (sistem ayarlarından alınır).' })
  @ApiQuery({ name: 'tags', required: false, description: 'uuid1,uuid2 formatında etiket filtresi' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Uzman listesi + toplam sayı + sayfalama' })
  findAll(@Query() filter: FilterExpertsDto) {
    return this.expertsService.findAll(filter);
  }

  @Public()
  @Get('tags')
  @ApiOperation({ summary: 'Aktif etiket listesi (public)' })
  getTags() {
    return this.expertsService.getTags();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Uzman detayı', description: 'Sadece YAYINDA durumundaki uzmanı döner.' })
  @ApiParam({ name: 'id', description: 'Uzman profil UUID' })
  @ApiResponse({ status: 200, description: 'Uzman detay bilgisi' })
  @ApiResponse({ status: 404, description: 'Uzman bulunamadı' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expertsService.findOne(id);
  }

  @Roles('UZMAN')
  @Get('me/profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Kendi profilim', description: 'Giriş yapan uzmanın kendi tam profil bilgisi.' })
  getMyProfile(@CurrentUser() user: User) {
    return this.expertsService.getMyProfile(user.id);
  }

  @Roles('UZMAN')
  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Profil güncelle', description: 'Güncelleme sonrası profil ONAY_BEKLIYOR statüsüne düşer. Bio 80-150 kelime arası zorunlu.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: 'Uzman Klinik Psikolog' },
        bio: { type: 'string', example: '80-150 kelime arası biyografi...' },
        education: { type: 'string', example: 'Hacettepe Üniversitesi...' },
        tagIds: { type: 'array', items: { type: 'string' }, example: ['uuid-1', 'uuid-2'] },
        avatar: { type: 'string', format: 'binary', description: 'Profil fotoğrafı (max 5MB)' },
      },
    },
  })
  @ApiResponse({ status: 200, schema: { example: { message: 'Profil güncellendi, admin onayı bekleniyor' } } })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, unique + extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Sadece görsel dosyası yüklenebilir'), false);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  updateMyProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.expertsService.updateMyProfile(user, dto, avatar);
  }

  @Roles('UZMAN')
  @Get('me/availabilities')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Kendi müsaitlik slotlarım' })
  getMyAvailabilities(@CurrentUser() user: User) {
    return this.expertsService.getMyAvailabilities(user.id);
  }

  @Roles('UZMAN')
  @Post('me/availabilities')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Müsaitlik slotu ekle', description: 'Haftanın belirli gün ve saatine müsaitlik ekler.' })
  @ApiResponse({ status: 201, description: 'Slot eklendi' })
  addAvailability(@CurrentUser() user: User, @Body() dto: CreateAvailabilityDto) {
    return this.expertsService.addAvailability(user.id, dto);
  }

  @Roles('UZMAN')
  @Delete('me/availabilities/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Müsaitlik slotunu sil' })
  @ApiParam({ name: 'id', description: 'Slot UUID' })
  removeAvailability(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.expertsService.removeAvailability(user.id, id);
  }

  @Public()
  @Get(':id/availabilities')
  @ApiOperation({ summary: 'Uzman müsaitlik takvimi', description: 'Admin tarafından bloklanmış slotlar hariç tüm slotlar döner.' })
  @ApiParam({ name: 'id', description: 'Uzman profil UUID' })
  getExpertAvailabilities(@Param('id', ParseUUIDPipe) id: string) {
    return this.expertsService.getExpertAvailabilities(id);
  }

  @Roles('DANISAN')
  @Post(':id/favorites')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Favorilere ekle' })
  @ApiParam({ name: 'id', description: 'Uzman profil UUID' })
  addFavorite(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.expertsService.addFavorite(user.id, id);
  }

  @Roles('DANISAN')
  @Delete(':id/favorites')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Favorilerden çıkar' })
  @ApiParam({ name: 'id', description: 'Uzman profil UUID' })
  removeFavorite(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.expertsService.removeFavorite(user.id, id);
  }

  @Roles('DANISAN')
  @Get('me/favorites')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Favorilerim' })
  getMyFavorites(@CurrentUser() user: User) {
    return this.expertsService.getMyFavorites(user.id);
  }
}
