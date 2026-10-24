import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { InboxEventsModule } from '../inbox-events/inbox-events.module';
import { MailModule } from '../mail/mail.module';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { AssistantService } from './assistant.service';
import { HandoffService } from './handoff.service';
import { KnowledgeService } from './knowledge.service';
import { LeadsService } from './leads.service';
import { OpenAiClient } from './openai.client';
import { PromptBuilder } from './prompt-builder';

@Module({
  imports: [NotificationsModule, MailModule, InboxEventsModule],
  providers: [
    OpenAiClient,
    KnowledgeService,
    PromptBuilder,
    LeadsService,
    HandoffService,
    MetaSenderService,
    AssistantService,
  ],
  exports: [AssistantService, KnowledgeService, HandoffService, MetaSenderService],
})
export class AssistantModule {}
