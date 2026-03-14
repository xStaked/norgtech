import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CalculatorsController } from './calculators.controller';
import { CalculatorsService } from './calculators.service';

@Module({
  imports: [PrismaModule],
  controllers: [CalculatorsController],
  providers: [CalculatorsService],
  exports: [CalculatorsService],
})
export class CalculatorsModule {}
