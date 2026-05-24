import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribeDto } from './dto/subscribe.dto';
export declare class NewsletterService {
    private prisma;
    private config;
    private readonly logger;
    constructor(prisma: PrismaService, config: ConfigService);
    subscribe(dto: SubscribeDto): Promise<{
        message: string;
    }>;
    private syncToBrevo;
}
