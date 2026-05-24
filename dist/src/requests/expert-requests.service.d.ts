import { PrismaService } from '../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { User, RequestStatus } from '@prisma/client';
export declare class ExpertRequestsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(user: User, expertProfileId: string, dto: CreateRequestDto): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        status: import("@prisma/client").$Enums.RequestStatus;
        userId: string;
        expertProfileId: string;
    }>;
    findAll(page?: number, limit?: number): Promise<{
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
    updateStatus(id: string, status: RequestStatus): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        status: import("@prisma/client").$Enums.RequestStatus;
        userId: string;
        expertProfileId: string;
    }>;
}
