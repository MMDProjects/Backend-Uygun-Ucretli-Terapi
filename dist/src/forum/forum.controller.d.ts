import { ForumService } from './forum.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import type { User } from '@prisma/client';
export declare class ForumController {
    private readonly forumService;
    constructor(forumService: ForumService);
    createQuestion(user: User, dto: CreateQuestionDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    }>;
    findAll(page?: string, limit?: string): Promise<{
        data: ({
            answers: {
                createdAt: Date;
                expertProfile: {
                    user: {
                        firstName: string;
                        lastName: string;
                    };
                    title: string;
                };
                content: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            status: import("@prisma/client").$Enums.QuestionStatus;
            userId: string;
            content: string;
            expertProfileId: string | null;
        })[];
        total: number;
        page: number;
        limit: number;
    }>;
    findOne(id: string): Promise<{
        answers: {
            id: string;
            createdAt: Date;
            content: string;
            expertProfileId: string;
            isApproved: boolean;
            questionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    }>;
    getAssignedQuestions(user: User): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    }[]>;
    createAnswer(user: User, id: string, dto: CreateAnswerDto): Promise<{
        id: string;
        createdAt: Date;
        content: string;
        expertProfileId: string;
        isApproved: boolean;
        questionId: string;
    }>;
}
