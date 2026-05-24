import { PrismaService } from '../prisma/prisma.service';
import { SaveResultDto } from './dto/save-result.dto';
import { User } from '@prisma/client';
export declare class TestsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<{
        id: string;
        description: string;
        title: string;
        slug: string;
    }[]>;
    findBySlug(slug: string): Promise<{
        id: string;
        isActive: boolean;
        description: string;
        title: string;
        slug: string;
    }>;
    saveResult(user: User, dto: SaveResultDto): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        testId: string;
        scoreSummary: string;
    }>;
    getHistory(userId: string): Promise<({
        test: {
            title: string;
            slug: string;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        testId: string;
        scoreSummary: string;
    })[]>;
}
