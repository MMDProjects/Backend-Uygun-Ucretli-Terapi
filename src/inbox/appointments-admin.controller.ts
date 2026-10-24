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
import { Roles } from '../common/decorators/roles.decorator';
import { AppointmentsAdminService } from './appointments-admin.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@Roles('ADMIN')
@Controller('admin/appointments')
export class AppointmentsAdminController {
  constructor(private readonly appointmentsService: AppointmentsAdminService) {}

  @Get()
  list(
    @Query('contactId') contactId?: string,
    @Query('therapistId') therapistId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.appointmentsService.list({ contactId, therapistId, from, to });
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(id, dto.status);
  }
}
