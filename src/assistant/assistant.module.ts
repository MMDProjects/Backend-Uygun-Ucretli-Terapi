import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { InboxEventsModule } from '../inbox-events/inbox-events.module';
import { MailModule } from '../mail/mail.module';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { AssistantService } from './assistant.service';
import { AssistantSettingsController } from './assistant-settings.controller';
import { AssistantSettingsService } from './assistant-settings.service';
import { CrisisAlertService } from './crisis-alert.service';
import { HandoffService } from './handoff.service';
import { KnowledgeService } from './knowledge.service';
import { LeadsService } from './leads.service';
import { OpenAiClient } from './openai.client';
import { PromptBuilder } from './prompt-builder';

@Module({
  imports: [NotificationsModule, MailModule, InboxEventsModule],
  controllers: [AssistantSettingsController],
  providers: [
    OpenAiClient,
    KnowledgeService,
    PromptBuilder,
    LeadsService,
    HandoffService,
    MetaSenderService,
    AssistantSettingsService,
    CrisisAlertService,
    AssistantService,
  ],
  exports: [
    AssistantService,
    KnowledgeService,
    HandoffService,
    MetaSenderService,
    AssistantSettingsService,
    CrisisAlertService,
  ],
})
export class AssistantModule {}
