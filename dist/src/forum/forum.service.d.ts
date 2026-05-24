import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { AssignQuestionDto } from './dto/assign-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { User } from '@prisma/client';
export declare class ForumService {
    private prisma;
    constructor(prisma: PrismaService);
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
    findAllPublic(page?: number, limit?: number): Promise<{
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
    findOnePublic(id: string): Promise<{
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
    assignQuestion(id: string, dto: AssignQuestionDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    }>;
    approveQuestion(id: string, approved: boolean): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    }>;
    getAssignedQuestions(userId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        status: import("@prisma/client").$Enums.QuestionStatus;
        userId: string;
        content: string;
        expertProfileId: string | null;
    }[]>;
    createAnswer(userId: string, questionId: string, dto: CreateAnswerDto): Promise<{
        id: string;
        createdAt: Date;
        content: string;
        expertProfileId: string;
        isApproved: boolean;
        questionId: string;
    }>;
    approveAnswer(id: string): Promise<{
        id: string;
        createdAt: Date;
        content: string;
        expertProfileId: string;
        isApproved: boolean;
        questionId: string;
    }>;
}
