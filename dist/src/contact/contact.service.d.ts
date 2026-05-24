import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateContactDto } from './dto/create-contact.dto';
export declare class ContactService {
    private prisma;
    private mail;
    constructor(prisma: PrismaService, mail: MailService);
    create(dto: CreateContactDto): Promise<{
        message: string;
        id: string;
    }>;
}
