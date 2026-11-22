import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { InboxEventsModule } from '../inbox-events/inbox-events.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { InstagramProfileService } from './instagram-profile.service';
import { WebhookFollowupService } from './webhook-followup.service';
import { MessagingModule } from '../messaging/messaging.module';
import { TemplateStatusHandler } from '../messaging/templates/template-status.handler';
import { TEMPLATE_STATUS_PORT } from './template-status.port';

@Module({
  imports: [AssistantModule, InboxEventsModule, MessagingModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    InstagramProfileService,
    WebhookFollowupService,
    // Şablon durum olayı: şablon modülündeki işleyiciye bağlanır.
    { provide: TEMPLATE_STATUS_PORT, useExisting: TemplateStatusHandler },
  ],
})
export class WebhooksModule {}
