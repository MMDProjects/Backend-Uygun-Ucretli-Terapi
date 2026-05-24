import { Module } from '@nestjs/common';
import { ExpertRequestsController } from './expert-requests.controller';
import { ExpertRequestsService } from './expert-requests.service';

@Module({
  controllers: [ExpertRequestsController],
  providers: [ExpertRequestsService],
  exports: [ExpertRequestsService],
})
export class ExpertRequestsModule {}
