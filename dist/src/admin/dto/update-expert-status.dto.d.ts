import { ApprovalStatus } from '@prisma/client';
export declare class UpdateExpertStatusDto {
    status: ApprovalStatus;
    adminNote?: string;
}
