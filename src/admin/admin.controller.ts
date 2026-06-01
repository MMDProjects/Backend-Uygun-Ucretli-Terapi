import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateExpertStatusDto } from './dto/update-expert-status.dto';
import { TogglePublishDto } from './dto/toggle-publish.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { UpsertSssDto } from './dto/upsert-sss.dto';
import { UpsertPackageDto } from './dto/upsert-package.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AssignQuestionDto } from '../forum/dto/assign-question.dto';
import { RequestStatus, ApprovalStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength, IsArray, IsBoolean } from 'class-validator';

class UpdateBlogStatusDto {
  @IsEnum(ApprovalStatus)
  status: ApprovalStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;
}

class UpdateBlogContentDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(100)
  content?: string;
}

class UpdateRequestStatusDto {
  @IsEnum(RequestStatus)
  status: RequestStatus;
}

class PriorityDto {
  priorityScore: number;
}

class BlockDto {
  @IsBoolean()
  block: boolean;
}

class BulkBlockDto {
  @IsArray()
  ids: string[];

  @IsBoolean()
  block: boolean;
}

class CreateTagDto {
  name: string;
}

class ToggleTagDto {
  isActive: boolean;
}

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  // Uzman yönetimi
  @Get('experts')
  getExperts(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.adminService.getExperts(+page, +limit);
  }

  @Get('experts/:id')
  getExpertById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getExpertById(id);
  }

  @Patch('experts/:id/status')
  updateExpertStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpertStatusDto) {
    return this.adminService.updateExpertStatus(id, dto);
  }

  @Patch('experts/:id/priority')
  updateExpertPriority(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PriorityDto) {
    return this.adminService.updateExpertPriority(id, dto.priorityScore);
  }

  @Patch('experts/:id/publish')
  @ApiOperation({ summary: 'Uzmanı yayına al / yayından kaldır' })
  toggleExpertPublish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TogglePublishDto) {
    return this.adminService.toggleExpertPublish(id, dto.isPublished);
  }

  @Patch('experts/:id/pricing')
  @ApiOperation({ summary: 'Uzmana özel fiyat ata (null = global fiyat kullan)' })
  updateExpertPricing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { standardPrice: number | null; discountedPrice: number | null },
  ) {
    return this.adminService.updateExpertPricing(id, dto.standardPrice, dto.discountedPrice);
  }

  @Patch('experts/:id/active')
  @ApiOperation({ summary: 'Uzman hesabını aktif / pasif yap' })
  toggleExpertActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { isActive: boolean },
  ) {
    return this.adminService.toggleExpertActive(id, dto.isActive);
  }

  @Get('experts/:id/availabilities')
  getExpertAvailabilities(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getExpertAvailabilities(id);
  }

  @Patch('availabilities/:id/block')
  blockAvailability(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BlockDto) {
    return this.adminService.blockAvailability(id, dto.block);
  }

  @Patch('availabilities/bulk-block')
  @ApiOperation({ summary: 'Toplu müsaitlik kilitleme/açma' })
  bulkBlockAvailabilities(@Body() dto: BulkBlockDto) {
    return this.adminService.bulkBlockAvailabilities(dto.ids, dto.block);
  }

  // Blog yönetimi
  @Get('blogs')
  getBlogs(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.adminService.getBlogs(+page, +limit);
  }

  @Patch('blogs/:id/status')
  updateBlogStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogStatusDto,
  ) {
    return this.adminService.updateBlogStatus(id, dto.status, dto.adminNote);
  }

  @Patch('blogs/:id/content')
  updateBlogContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogContentDto,
  ) {
    return this.adminService.updateBlogContent(id, dto);
  }

  // Forum yönetimi
  @Get('forum/questions')
  getForumQuestions(@Query('status') status?: string) {
    return this.adminService.getForumQuestions(status);
  }

  @Patch('forum/questions/:id/assign')
  assignForumQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignQuestionDto,
  ) {
    return this.adminService.assignForumQuestion(id, dto.expertProfileId);
  }

  @Patch('forum/questions/:id/approve')
  approveForumQuestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveForumQuestion(id);
  }

  @Patch('forum/answers/:id/approve')
  approveForumAnswer(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveForumAnswer(id);
  }

  // Yorum yönetimi
  @Patch('comments/:id/approve')
  approveComment(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.approveComment(id);
  }

  // Talepler
  @Get('requests')
  getRequests(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.adminService.getRequests(+page, +limit);
  }

  @Patch('requests/:id/status')
  updateRequestStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestStatusDto,
  ) {
    return this.adminService.updateRequestStatus(id, dto.status);
  }

  // Sistem ayarları
  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.adminService.updateSettings(dto);
  }

  // Paketler
  @Get('packages')
  getPackages() {
    return this.adminService.getPackages();
  }

  @Put('packages/:id')
  updatePackage(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertPackageDto) {
    return this.adminService.updatePackage(id, dto);
  }

  // SSS
  @Get('sss')
  getSss() {
    return this.adminService.getSss();
  }

  @Post('sss')
  createSss(@Body() dto: UpsertSssDto) {
    return this.adminService.createSss(dto);
  }

  @Patch('sss/:id')
  updateSss(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertSssDto) {
    return this.adminService.updateSss(id, dto);
  }

  @Delete('sss/:id')
  deleteSss(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteSss(id);
  }

  // İletişim formu
  @Get('contact-forms')
  getContactForms(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.adminService.getContactForms(+page, +limit);
  }

  @Patch('contact-forms/:id/status')
  @ApiParam({ name: 'id', description: 'ContactForm UUID' })
  updateContactFormStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
  ) {
    return this.adminService.updateContactFormStatus(id, status);
  }

  // Danışan listesi
  @Get('users')
  getUsers(@Query('page') page = '1', @Query('limit') limit = '20', @Query('search') search?: string) {
    return this.adminService.getUsers(+page, +limit, search);
  }

  // Bildirim gönder
  @Post('notifications')
  sendNotification(@Body() dto: SendNotificationDto) {
    return this.adminService.sendNotification(dto);
  }

  // Etiket yönetimi
  @Get('tags')
  getTags() {
    return this.adminService.getTags();
  }

  @Post('tags')
  createTag(@Body() dto: CreateTagDto) {
    return this.adminService.createTag(dto.name);
  }

  @Patch('tags/:id')
  toggleTag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ToggleTagDto) {
    return this.adminService.toggleTag(id, dto.isActive);
  }
}
