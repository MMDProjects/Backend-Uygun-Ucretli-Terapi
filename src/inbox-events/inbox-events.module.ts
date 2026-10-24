import { Module } from '@nestjs/common';
import { InboxEventsService } from './inbox-events.service';

@Module({
  providers: [InboxEventsService],
  exports: [InboxEventsService],
})
export class InboxEventsModule {}
