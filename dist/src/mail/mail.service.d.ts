import { ConfigService } from '@nestjs/config';
export declare class MailService {
    private config;
    private readonly logger;
    constructor(config: ConfigService);
    private getClient;
    sendPasswordReset(email: string, name: string, token: string): Promise<void>;
    sendContactConfirmation(email: string, name: string): Promise<void>;
}
