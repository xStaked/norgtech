import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [PrismaModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
