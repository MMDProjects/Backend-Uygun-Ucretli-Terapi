import { ContactSubject } from '@prisma/client';
export declare class CreateContactDto {
    fullName: string;
    email: string;
    phone: string;
    subject: ContactSubject;
    message: string;
    isCorporate?: boolean;
    companyName?: string;
    employeeCount?: string;
}
