import { PrismaService } from '../prisma/prisma.service';
import { SssPage } from '@prisma/client';
export declare class SssService {
    private prisma;
    constructor(prisma: PrismaService);
    findByPage(page?: SssPage): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        page: import("@prisma/client").$Enums.SssPage;
        question: string;
        answer: string;
    }[]>;
}
