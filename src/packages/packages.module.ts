import { Module } from '@nestjs/common';
import { PackagesController } from './packages.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PackagesController],
})
export class PackagesModule {}
