import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import type { User } from '@prisma/client';
export declare class CommentsController {
    private readonly commentsService;
    constructor(commentsService: CommentsService);
    create(user: User, expertId: string, dto: CreateCommentDto): Promise<{
        id: string;
        createdAt: Date;
        rating: number;
        userId: string;
        content: string;
        expertProfileId: string;
        isApproved: boolean;
    }>;
    findApproved(expertId: string): Promise<{
        id: string;
        createdAt: Date;
        user: {
            firstName: string;
            lastName: string;
        };
        rating: number;
        content: string;
    }[]>;
}
