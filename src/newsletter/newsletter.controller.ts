import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NewsletterService } from './newsletter.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('newsletter')
@Public()
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Bültene abone ol', description: 'E-posta DB\'ye kaydedilir ve Brevo Contact List\'e asenkron eklenir.' })
  @ApiResponse({ status: 201, schema: { example: { message: 'Bültene başarıyla kaydoldunuz' } } })
  @ApiResponse({ status: 409, description: 'Bu e-posta zaten kayıtlı' })
  subscribe(@Body() dto: SubscribeDto) {
    return this.newsletterService.subscribe(dto);
  }
}
