import { NewsletterService } from './newsletter.service';
import { SubscribeDto } from './dto/subscribe.dto';
export declare class NewsletterController {
    private readonly newsletterService;
    constructor(newsletterService: NewsletterService);
    subscribe(dto: SubscribeDto): Promise<{
        message: string;
    }>;
}
