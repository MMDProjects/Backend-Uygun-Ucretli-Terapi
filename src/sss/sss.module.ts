import { Module } from '@nestjs/common';
import { SssController } from './sss.controller';
import { SssService } from './sss.service';

@Module({
  controllers: [SssController],
  providers: [SssService],
})
export class SssModule {}
