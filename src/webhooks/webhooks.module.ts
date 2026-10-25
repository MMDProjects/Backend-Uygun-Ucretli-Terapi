import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { InboxEventsModule } from '../inbox-events/inbox-events.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { InstagramProfileService } from './instagram-profile.service';

@Module({
  imports: [AssistantModule, InboxEventsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, InstagramProfileService],
})
export class WebhooksModule {}
