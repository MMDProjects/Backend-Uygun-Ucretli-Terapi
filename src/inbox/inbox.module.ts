import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { InboxEventsModule } from '../inbox-events/inbox-events.module';
import { AppointmentsAdminController } from './appointments-admin.controller';
import { AppointmentsAdminService } from './appointments-admin.service';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { KnowledgeAdminController } from './knowledge-admin.controller';
import { KnowledgeAdminService } from './knowledge-admin.service';
import { LeadsAdminController } from './leads-admin.controller';
import { LeadsAdminService } from './leads-admin.service';
import { UnansweredAdminController } from './unanswered-admin.controller';

@Module({
  imports: [AssistantModule, InboxEventsModule],
  controllers: [
    InboxController,
    LeadsAdminController,
    UnansweredAdminController,
    KnowledgeAdminController,
    AppointmentsAdminController,
  ],
  providers: [
    InboxService,
    LeadsAdminService,
    KnowledgeAdminService,
    AppointmentsAdminService,
  ],
})
export class InboxModule {}
