import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { InboxService } from './inbox.service';
import { ListConversationsQueryDto } from './dto/list-conversations.query.dto';
import { ListMessagesQueryDto } from './dto/list-messages.query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { AssignConversationDto } from './dto/assign-conversation.dto';
import { SearchMessagesQueryDto } from './dto/search-messages.query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('admin-inbox')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/inbox')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get('conversations')
  listConversations(
    @Query() query: ListConversationsQueryDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.inboxService.listConversations(query, user.id);
  }

  @Get('search')
  searchMessages(@Query() query: SearchMessagesQueryDto) {
    return this.inboxService.searchMessages(query.q);
  }

  @Get('conversations/:id')
  getConversation(@Param('id', ParseUUIDPipe) id: string) {
    return this.inboxService.getConversation(id);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.inboxService.listMessages(id, query);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.inboxService.sendMessage(id, dto, user.id);
  }

  @Post('conversations/:id/takeover')
  takeover(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.inboxService.takeover(id, user.id);
  }

  @Post('conversations/:id/assign')
  assignConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignConversationDto,
  ) {
    return this.inboxService.assignConversation(id, dto.userId);
  }

  @Post('conversations/:id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.inboxService.markRead(id, user.id);
  }

  @Post('conversations/:id/handback')
  handback(@Param('id', ParseUUIDPipe) id: string) {
    return this.inboxService.handback(id);
  }

  @Post('conversations/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.inboxService.close(id);
  }

  @Patch('contacts/:id')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.inboxService.updateContact(id, dto);
  }

  @Delete('contacts/:id/summary')
  deleteContactSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.inboxService.deleteContactSummary(id);
  }

  @Get('counts')
  getCounts(@CurrentUser() user: { id: string }) {
    return this.inboxService.getCounts(user.id);
  }

  @Sse('stream')
  stream(): Observable<{ type: string; data: unknown }> {
    return this.inboxService.stream();
  }
}
