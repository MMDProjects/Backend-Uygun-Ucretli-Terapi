import { Module } from '@nestjs/common';
import { AssistantModule } from '../../assistant/assistant.module';
import { InboxEventsModule } from '../../inbox-events/inbox-events.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { ReminderWorker } from './reminder-worker.service';

// MetaSenderService AssistantModule üzerinden gelir.
@Module({
  imports: [AssistantModule, InboxEventsModule],
  controllers: [RemindersController],
  providers: [RemindersService, ReminderWorker],
  exports: [RemindersService],
})
export class RemindersModule {}
