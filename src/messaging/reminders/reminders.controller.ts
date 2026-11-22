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
import { Roles } from '../../common/decorators/roles.decorator';
import { ListRemindersQueryDto } from './dto/list-reminders.query.dto';
import { UpdateReminderSettingsDto } from './dto/update-reminder-settings.dto';
import { RemindersService } from './reminders.service';

@Roles('ADMIN')
@Controller('admin/reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('settings')
  getSettings() {
    return this.reminders.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateReminderSettingsDto) {
    return this.reminders.updateSettings(dto);
  }

  @Get()
  list(@Query() query: ListRemindersQueryDto) {
    return this.reminders.list(query);
  }

  @Post(':id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.reminders.retry(id);
  }
}
