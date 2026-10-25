import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AssistantSettingsService } from './assistant-settings.service';
import { UpdateAssistantSettingsDto } from './dto/update-assistant-settings.dto';

@Roles('ADMIN')
@Controller('admin/assistant/settings')
export class AssistantSettingsController {
  constructor(private readonly settings: AssistantSettingsService) {}

  @Get()
  get() {
    return this.settings.getSettings();
  }

  @Patch()
  update(
    @Body() dto: UpdateAssistantSettingsDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.settings.updateSettings(dto, user.id);
  }
}
