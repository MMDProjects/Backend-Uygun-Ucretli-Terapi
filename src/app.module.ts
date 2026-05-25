import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ExpertsModule } from './experts/experts.module';
import { ForumModule } from './forum/forum.module';
import { CommentsModule } from './comments/comments.module';
import { ExpertRequestsModule } from './requests/expert-requests.module';
import { TestsModule } from './tests/tests.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MailModule } from './mail/mail.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { BlogsModule } from './blogs/blogs.module';
import { SssModule } from './sss/sss.module';
import { ContactModule } from './contact/contact.module';
import { PackagesModule } from './packages/packages.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    ExpertsModule,
    ForumModule,
    CommentsModule,
    ExpertRequestsModule,
    TestsModule,
    AdminModule,
    NotificationsModule,
    MailModule,
    NewsletterModule,
    BlogsModule,
    SssModule,
    ContactModule,
    PackagesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
