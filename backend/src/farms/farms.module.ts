import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FarmsController } from './farms.controller';
import { PortalFarmsController } from './portal-farms.controller';
import { FarmsService } from './farms.service';

@Module({
  imports: [PrismaModule],
  controllers: [FarmsController, PortalFarmsController],
  providers: [FarmsService],
  exports: [FarmsService],
})
export class FarmsModule {}
