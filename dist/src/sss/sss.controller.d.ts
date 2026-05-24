import { SssService } from './sss.service';
import { SssPage } from '@prisma/client';
export declare class SssController {
    private readonly sssService;
    constructor(sssService: SssService);
    findAll(page?: SssPage): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        page: import("@prisma/client").$Enums.SssPage;
        question: string;
        answer: string;
    }[]>;
}
