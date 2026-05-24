import { Controller, Get, Patch, Param, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { SseService } from './sse.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly sseService: SseService,
  ) {}

  @Sse('stream')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'SSE bildirim akışı', description: 'EventSource ile bağlanılır. Admin DANGER_PANIC gönderdiğinde anlık pop-up tetiklenir. text/event-stream döner.' })
  @ApiResponse({ status: 200, description: '{ type: "notification", data: { type, message, id } }' })
  stream(@CurrentUser() user: User, @Param() _: unknown): Observable<{ data: unknown }> {
    return this.sseService.register(user.id).asObservable();
  }

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Okunmamış bildirimler' })
  getUnread(@CurrentUser() user: User) {
    return this.notificationsService.getUnread(user.id);
  }

  @Patch(':id/read')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Bildirimi okundu işaretle' })
  @ApiParam({ name: 'id', description: 'Bildirim UUID' })
  markRead(@CurrentUser() user: User, @Param('id') id: string) {
    return this.notificationsService.markRead(id, user.id);
  }
}
