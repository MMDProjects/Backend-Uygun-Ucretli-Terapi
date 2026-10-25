import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import {
  CreateCampaignDto,
  ListCampaignsQueryDto,
  ListRecipientsQueryDto,
  ScheduleCampaignDto,
  UpdateCampaignDto,
  UpdateCampaignSettingsDto,
  UpdateRecipientsDto,
} from './dto/campaign.dto';

// "settings" rotaları :id rotalarından önce tanımlanmalıdır.
@ApiTags('admin-messaging')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get('settings')
  getSettings() {
    return this.campaigns.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateCampaignSettingsDto) {
    return this.campaigns.updateSettings(dto);
  }

  @Get()
  list(@Query() query: ListCampaignsQueryDto) {
    return this.campaigns.list(query);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: { id: string }) {
    return this.campaigns.create(dto, user.id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.findDetail(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaigns.update(id, dto);
  }

  @Post(':id/prepare')
  prepare(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.prepare(id);
  }

  @Get(':id/recipients')
  listRecipients(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListRecipientsQueryDto,
  ) {
    return this.campaigns.listRecipients(id, query);
  }

  @Patch(':id/recipients')
  updateRecipients(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecipientsDto,
  ) {
    return this.campaigns.updateRecipients(id, dto);
  }

  @Get(':id/preview')
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.preview(id);
  }

  @Get(':id/estimate')
  estimate(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.estimate(id);
  }

  @Post(':id/send')
  send(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.send(id);
  }

  @Post(':id/schedule')
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.campaigns.schedule(id, new Date(dto.at));
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancel(id);
  }

  @Get(':id/report')
  report(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.report(id);
  }
}
