import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { FilterExpertsDto } from './dto/filter-experts.dto';
import { User } from '@prisma/client';
export declare class ExpertsService {
    private prisma;
    constructor(prisma: PrismaService);
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
    updateMyProfile(user: User, dto: UpdateProfileDto, avatarFile?: Express.Multer.File): Promise<{
        message: string;
    }>;
    getMyProfile(userId: string): Promise<{
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
    getMyAvailabilities(userId: string): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }[]>;
    addAvailability(userId: string, dto: CreateAvailabilityDto): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }>;
    removeAvailability(userId: string, availId: string): Promise<{
        message: string;
    }>;
    getExpertAvailabilities(expertId: string): Promise<{
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isBlockedByAdmin: boolean;
        expertProfileId: string;
    }[]>;
    addFavorite(userId: string, expertProfileId: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        expertProfileId: string;
    }>;
    removeFavorite(userId: string, expertProfileId: string): Promise<{
        message: string;
    }>;
    getMyFavorites(userId: string): Promise<({
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
