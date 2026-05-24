import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { User } from '@prisma/client';
export declare class CommentsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(user: User, expertProfileId: string, dto: CreateCommentDto): Promise<{
        id: string;
        createdAt: Date;
        rating: number;
        userId: string;
        content: string;
        expertProfileId: string;
        isApproved: boolean;
    }>;
    findApproved(expertProfileId: string): Promise<{
        id: string;
        createdAt: Date;
        user: {
            firstName: string;
            lastName: string;
        };
        rating: number;
        content: string;
    }[]>;
    approve(id: string): Promise<{
        message: string;
        newRating: number;
    }>;
}
