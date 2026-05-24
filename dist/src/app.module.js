"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const experts_module_1 = require("./experts/experts.module");
const forum_module_1 = require("./forum/forum.module");
const comments_module_1 = require("./comments/comments.module");
const expert_requests_module_1 = require("./requests/expert-requests.module");
const tests_module_1 = require("./tests/tests.module");
const admin_module_1 = require("./admin/admin.module");
const notifications_module_1 = require("./notifications/notifications.module");
const mail_module_1 = require("./mail/mail.module");
const newsletter_module_1 = require("./newsletter/newsletter.module");
const blogs_module_1 = require("./blogs/blogs.module");
const sss_module_1 = require("./sss/sss.module");
const contact_module_1 = require("./contact/contact.module");
const jwt_auth_guard_1 = require("./common/guards/jwt-auth.guard");
const roles_guard_1 = require("./common/guards/roles.guard");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            experts_module_1.ExpertsModule,
            forum_module_1.ForumModule,
            comments_module_1.CommentsModule,
            expert_requests_module_1.ExpertRequestsModule,
            tests_module_1.TestsModule,
            admin_module_1.AdminModule,
            notifications_module_1.NotificationsModule,
            mail_module_1.MailModule,
            newsletter_module_1.NewsletterModule,
            blogs_module_1.BlogsModule,
            sss_module_1.SssModule,
            contact_module_1.ContactModule,
        ],
        providers: [
            { provide: core_1.APP_GUARD, useClass: jwt_auth_guard_1.JwtAuthGuard },
            { provide: core_1.APP_GUARD, useClass: roles_guard_1.RolesGuard },
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map