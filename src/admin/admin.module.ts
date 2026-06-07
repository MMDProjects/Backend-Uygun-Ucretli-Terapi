import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AppService } from '../app.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { CommentsModule } from '../comments/comments.module';
import { ExpertRequestsModule } from '../requests/expert-requests.module';
import { ForumModule } from '../forum/forum.module';

@Module({
  imports: [NotificationsModule, MailModule, CommentsModule, ExpertRequestsModule, ForumModule],
  controllers: [AdminController],
  providers: [AdminService, AppService],
})
export class AdminModule {}
