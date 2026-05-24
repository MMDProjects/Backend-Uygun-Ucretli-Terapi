import { AdminService } from './admin.service';
import { UpdateExpertStatusDto } from './dto/update-expert-status.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { UpsertSssDto } from './dto/upsert-sss.dto';
import { UpsertPackageDto } from './dto/upsert-package.dto';
import { AssignQuestionDto } from '../forum/dto/assign-question.dto';
import { RequestStatus, ApprovalStatus } from '@prisma/client';
declare class UpdateBlogStatusDto {
    status: ApprovalStatus;
    adminNote?: string;
}
declare class UpdateRequestStatusDto {
    status: RequestStatus;
}
declare class PriorityDto {
    priorityScore: number;
}
declare class BlockDto {
    block: boolean;
}
declare class CreateTagDto {
    name: string;
}
declare class ToggleTagDto {
    isActive: boolean;
}
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    getDashboard(): Promise<{
        pendingExperts: number;
        pendingBlogs: number;
        pendingComments: number;
        pendingQuestions: number;
        newRequests: number;
    }>;
    getExperts(page?: string, limit?: string): Promise<{
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
    updateExpertPriority(id: string, dto: PriorityDto): Promise<{
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
    getExpertAvailabilities(id: string): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }[]>;
    blockAvailability(id: string, dto: BlockDto): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }>;
    getBlogs(page?: string, limit?: string): Promise<{
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
    updateBlogStatus(id: string, dto: UpdateBlogStatusDto): Promise<{
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
    assignForumQuestion(id: string, dto: AssignQuestionDto): Promise<{
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
    getRequests(page?: string, limit?: string): Promise<{
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
    updateRequestStatus(id: string, dto: UpdateRequestStatusDto): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        status: import("@prisma/client").$Enums.RequestStatus;
        userId: string;
        expertProfileId: string;
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
    getTags(): Promise<{
        id: string;
        isActive: boolean;
        name: string;
    }[]>;
    createTag(dto: CreateTagDto): Promise<{
        id: string;
        isActive: boolean;
        name: string;
    }>;
    toggleTag(id: string, dto: ToggleTagDto): Promise<{
        id: string;
        isActive: boolean;
        name: string;
    }>;
}
export {};
