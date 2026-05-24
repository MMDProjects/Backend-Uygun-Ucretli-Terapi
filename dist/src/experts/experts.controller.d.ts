import { ExpertsService } from './experts.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { FilterExpertsDto } from './dto/filter-experts.dto';
import type { User } from '@prisma/client';
export declare class ExpertsController {
    private readonly expertsService;
    constructor(expertsService: ExpertsService);
    findAll(filter: FilterExpertsDto): Promise<{
        data: {
            id: string;
            user: {
                firstName: string;
                lastName: string;
            };
            title: string;
            avatarUrl: string;
            bio: string;
            priorityScore: number;
            rating: number;
            tags: {
                id: string;
                name: string;
            }[];
        }[];
        total: number;
        page: number;
        limit: number;
    }>;
    findOne(id: string): Promise<{
        id: string;
        user: {
            firstName: string;
            lastName: string;
        };
        title: string;
        avatarUrl: string;
        bio: string;
        education: string;
        rating: number;
        tags: {
            id: string;
            name: string;
        }[];
        availabilities: {
            dayOfWeek: number;
            startTime: string;
            endTime: string;
        }[];
    }>;
    getMyProfile(user: User): Promise<{
        tags: {
            id: string;
            isActive: boolean;
            name: string;
        }[];
        availabilities: {
            id: string;
            dayOfWeek: number;
            startTime: string;
            endTime: string;
            isBlockedByAdmin: boolean;
            expertProfileId: string;
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
    }>;
    updateMyProfile(user: User, dto: UpdateProfileDto, avatar?: Express.Multer.File): Promise<{
        message: string;
    }>;
    getMyAvailabilities(user: User): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }[]>;
    addAvailability(user: User, dto: CreateAvailabilityDto): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }>;
    removeAvailability(user: User, id: string): Promise<{
        message: string;
    }>;
    getExpertAvailabilities(id: string): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }[]>;
    addFavorite(user: User, id: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        expertProfileId: string;
    }>;
    removeFavorite(user: User, id: string): Promise<{
        message: string;
    }>;
    getMyFavorites(user: User): Promise<({
        expertProfile: {
            id: string;
            user: {
                firstName: string;
                lastName: string;
            };
            title: string;
            avatarUrl: string;
            rating: number;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        expertProfileId: string;
    })[]>;
}
