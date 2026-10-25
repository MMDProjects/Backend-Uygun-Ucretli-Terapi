import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InboxTemplateService } from './inbox-template.service';
import { SendTemplateDto } from './dto/send-template.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('admin-inbox')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/inbox')
export class InboxTemplateController {
  constructor(private readonly templates: InboxTemplateService) {}

  @Post('conversations/:id/template')
  sendTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendTemplateDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.templates.sendTemplate(id, dto, user.id);
  }
}
