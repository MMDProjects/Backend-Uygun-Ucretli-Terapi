import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { InboxEventsModule } from '../inbox-events/inbox-events.module';
import { MessagingModule } from '../messaging/messaging.module';
import { TemplatesService } from '../messaging/templates/templates.service';
import { APPROVED_TEMPLATE_PORT } from './approved-template.port';
import { AppointmentsAdminController } from './appointments-admin.controller';
import { AssistantPreviewController } from './assistant-preview.controller';
import { AppointmentsAdminService } from './appointments-admin.service';
import { CannedResponsesController } from './canned-responses.controller';
import { CannedResponsesService } from './canned-responses.service';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InboxTemplateController } from './inbox-template.controller';
import { InboxTemplateService } from './inbox-template.service';
import { KnowledgeAdminController } from './knowledge-admin.controller';
import { KnowledgeAdminService } from './knowledge-admin.service';
import { LeadsAdminController } from './leads-admin.controller';
import { LeadsAdminService } from './leads-admin.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { UnansweredAdminController } from './unanswered-admin.controller';

@Module({
  imports: [AssistantModule, InboxEventsModule, MessagingModule],
  controllers: [
    InboxController,
    InboxTemplateController,
    LeadsAdminController,
    UnansweredAdminController,
    KnowledgeAdminController,
    AppointmentsAdminController,
    AssistantPreviewController,
    TagsController,
    CannedResponsesController,
  ],
  providers: [
    InboxService,
    InboxTemplateService,
    LeadsAdminService,
    KnowledgeAdminService,
    AppointmentsAdminService,
    TagsService,
    CannedResponsesService,
    // Şablonla gönderim: onaylı şablonu şablon modülünden okur.
    { provide: APPROVED_TEMPLATE_PORT, useExisting: TemplatesService },
  ],
})
export class InboxModule {}
