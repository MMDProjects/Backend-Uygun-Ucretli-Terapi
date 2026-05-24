import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommentsService } from '../comments/comments.service';
import { ExpertRequestsService } from '../requests/expert-requests.service';
import { ForumService } from '../forum/forum.service';
import { UpdateExpertStatusDto } from './dto/update-expert-status.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { UpsertSssDto } from './dto/upsert-sss.dto';
import { UpsertPackageDto } from './dto/upsert-package.dto';
import { RequestStatus, ApprovalStatus } from '@prisma/client';
export declare class AdminService {
    private prisma;
    private notificationsService;
    private commentsService;
    private expertRequestsService;
    private forumService;
    constructor(prisma: PrismaService, notificationsService: NotificationsService, commentsService: CommentsService, expertRequestsService: ExpertRequestsService, forumService: ForumService);
    getDashboard(): Promise<{
        pendingExperts: number;
        pendingBlogs: number;
        pendingComments: number;
        pendingQuestions: number;
        newRequests: number;
    }>;
    getExperts(page?: number, limit?: number): Promise<{
        data: ({
            user: {
                email: string;
                firstName: string;
                lastName: string;
            };
            tags: {
                id: string;
                isActive: boolean;
                name: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            avatarUrl: string;
            bio: string;
            education: string;
            certificateUrl: string;
            cvUrl: string;
            priorityScore: number;
            rating: number;
            status: import("@prisma/client").$Enums.ApprovalStatus;
            adminNote: string | null;
            userId: string;
        })[];
        total: number;
        page: number;
        limit: number;
    }>;
    updateExpertStatus(id: string, dto: UpdateExpertStatusDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        avatarUrl: string;
        bio: string;
        education: string;
        certificateUrl: string;
        cvUrl: string;
        priorityScore: number;
        rating: number;
        status: import("@prisma/client").$Enums.ApprovalStatus;
        adminNote: string | null;
        userId: string;
    }>;
    updateExpertPriority(id: string, priorityScore: number): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        avatarUrl: string;
        bio: string;
        education: string;
        certificateUrl: string;
        cvUrl: string;
        priorityScore: number;
        rating: number;
        status: import("@prisma/client").$Enums.ApprovalStatus;
        adminNote: string | null;
        userId: string;
    }>;
    getBlogs(page?: number, limit?: number): Promise<{
        data: ({
            expertProfile: {
                user: {
                    firstName: string;
                    lastName: string;
                };
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            status: import("@prisma/client").$Enums.ApprovalStatus;
            adminNote: string | null;
            content: string;
            expertProfileId: string;
            slug: string;
        })[];
        total: number;
        page: number;
        limit: number;
    }>;
    updateBlogStatus(id: string, status: ApprovalStatus, adminNote?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.ApprovalStatus;
        adminNote: string | null;
        content: string;
        expertProfileId: string;
        slug: string;
    }>;
    getSettings(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        whatsappNumber: string;
        instagramUrl: string;
        standardPrice: import("@prisma/client/runtime/library").Decimal;
        discountedPrice: import("@prisma/client/runtime/library").Decimal;
        logoUrl: string;
        videoUrl: string | null;
    } | null>;
    updateSettings(dto: UpdateSystemSettingsDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        whatsappNumber: string;
        instagramUrl: string;
        standardPrice: import("@prisma/client/runtime/library").Decimal;
        discountedPrice: import("@prisma/client/runtime/library").Decimal;
        logoUrl: string;
        videoUrl: string | null;
    }>;
    getPackages(): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        sessionCount: number;
        price: import("@prisma/client/runtime/library").Decimal;
        description: string;
    }[]>;
    updatePackage(id: string, dto: UpsertPackageDto): Promise<{
        id: string;
        updatedAt: Date;
        name: string;
        sessionCount: number;
        price: import("@prisma/client/runtime/library").Decimal;
        description: string;
    }>;
    getSss(): Promise<{
        id: string;
        isActive: boolean;
        page: import("@prisma/client").$Enums.SssPage;
        question: string;
        answer: string;
        order: number;
    }[]>;
    createSss(dto: UpsertSssDto): Promise<{
        id: string;
        isActive: boolean;
        page: import("@prisma/client").$Enums.SssPage;
        question: string;
        answer: string;
        order: number;
    }>;
    updateSss(id: string, dto: UpsertSssDto): Promise<{
        id: string;
        isActive: boolean;
        page: import("@prisma/client").$Enums.SssPage;
        question: string;
        answer: string;
        order: number;
    }>;
    deleteSss(id: string): Promise<{
        message: string;
    }>;
    sendNotification(dto: SendNotificationDto): Promise<{
        id: string;
        createdAt: Date;
        type: import("@prisma/client").$Enums.NotificationType;
        message: string;
        userId: string;
        isRead: boolean;
    }>;
    getForumQuestions(status?: string): Promise<({
        expertProfile: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            avatarUrl: string;
            bio: string;
            education: string;
            certificateUrl: string;
            cvUrl: string;
            priorityScore: number;
            rating: number;
            status: import("@prisma/client").$Enums.ApprovalStatus;
            adminNote: string | null;
            userId: string;
        } | null;
        user: {
            firstName: string;
            lastName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    })[]>;
    assignForumQuestion(id: string, expertProfileId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    }>;
    approveForumQuestion(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    }>;
    approveForumAnswer(id: string): Promise<{
        id: string;
        createdAt: Date;
        content: string;
        expertProfileId: string;
        isApproved: boolean;
        questionId: string;
    }>;
    approveComment(id: string): Promise<{
        message: string;
        newRating: number;
    }>;
    getRequests(page?: number, limit?: number): Promise<{
        data: ({
            expertProfile: {
                user: {
                    firstName: string;
                    lastName: string;
                };
                title: string;
            };
            user: {
                email: string;
                firstName: string;
                lastName: string;
                phone: string;
            };
        } & {
            id: string;
            createdAt: Date;
            message: string;
            status: import("@prisma/client").$Enums.RequestStatus;
            userId: string;
            expertProfileId: string;
        })[];
        total: number;
        page: number;
        limit: number;
    }>;
    updateRequestStatus(id: string, status: RequestStatus): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        status: import("@prisma/client").$Enums.RequestStatus;
        userId: string;
        expertProfileId: string;
    }>;
    getExpertAvailabilities(expertId: string): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }[]>;
    blockAvailability(id: string, block: boolean): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }>;
    getTags(): Promise<{
        id: string;
        isActive: boolean;
        name: string;
    }[]>;
    createTag(name: string): Promise<{
        id: string;
        isActive: boolean;
        name: string;
    }>;
    toggleTag(id: string, isActive: boolean): Promise<{
        id: string;
        isActive: boolean;
        name: string;
    }>;
}
