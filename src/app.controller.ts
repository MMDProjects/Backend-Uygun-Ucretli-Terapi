import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Deploy sonrasi ayaga kalkti mi kontrolu icin. Kimlik dogrulama gerektirmez. */
  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('settings')
  getPublicSettings() {
    return this.appService.getPublicSettings();
  }

  @Public()
  @Get('kvkk')
  getPublicKvkk() {
    return this.appService.getPublicKvkk();
  }
}
