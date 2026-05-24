import { ExpertRequestsService } from './expert-requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import type { User } from '@prisma/client';
export declare class ExpertRequestsController {
    private readonly service;
    constructor(service: ExpertRequestsService);
    create(user: User, expertId: string, dto: CreateRequestDto): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        status: import("@prisma/client").$Enums.RequestStatus;
        userId: string;
        expertProfileId: string;
    }>;
}
