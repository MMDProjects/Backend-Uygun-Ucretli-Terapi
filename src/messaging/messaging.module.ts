import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersModule } from './reminders/reminders.module';
import { ContactsAdminController } from './contacts/contacts-admin.controller';
import { ContactsAdminService } from './contacts/contacts-admin.service';
import { ContactListsController } from './contact-lists/contact-lists.controller';
import { ContactListsService } from './contact-lists/contact-lists.service';
import { CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';
import { CampaignWorker } from './campaigns/campaign-worker';
import { MetaTemplatesClient } from './templates/meta-templates.client';
import { TemplateStatusHandler } from './templates/template-status.handler';
import { TemplatesController } from './templates/templates.controller';
import { TemplatesService } from './templates/templates.service';

// Şablon, hatırlatma ve kampanya kayıtları bu dosyada toplanır.
// MetaSenderService AssistantModule'den gelir. RemindersModule kendi
// denetleyicisini ve işçisini taşır; burada yalnızca içe aktarılır.
@Module({
  imports: [AssistantModule, NotificationsModule, RemindersModule],
  controllers: [
    TemplatesController,
    ContactsAdminController,
    ContactListsController,
    CampaignsController,
  ],
  providers: [
    MetaTemplatesClient,
    TemplatesService,
    TemplateStatusHandler,
    ContactsAdminService,
    ContactListsService,
    CampaignsService,
    CampaignWorker,
  ],
  exports: [
    CampaignsService,
    // Dışa açılan şey sağlayıcı değil modüldür; RemindersService RemindersModule'den gelir.
    RemindersModule,
    TemplatesService,
    TemplateStatusHandler,
  ],
})
export class MessagingModule {}
