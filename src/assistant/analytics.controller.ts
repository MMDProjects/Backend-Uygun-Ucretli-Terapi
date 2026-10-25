import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

// Elif analiz paneli. Yalnızca ADMIN.
@Roles('ADMIN')
@Controller('admin/assistant/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  get(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getAnalytics(query);
  }
}
