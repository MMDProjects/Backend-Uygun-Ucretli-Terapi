import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { LeadsAdminService } from './leads-admin.service';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';

@Roles('ADMIN')
@Controller('admin/leads')
export class LeadsAdminController {
  constructor(private readonly leads: LeadsAdminService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.leads.list({ status, page: Number(page), limit: Number(limit) });
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leads.updateStatus(id, dto);
  }
}
