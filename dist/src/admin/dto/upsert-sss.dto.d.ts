import { SssPage } from '@prisma/client';
export declare class UpsertSssDto {
    question: string;
    answer: string;
    page: SssPage;
    isActive?: boolean;
    order?: number;
}
