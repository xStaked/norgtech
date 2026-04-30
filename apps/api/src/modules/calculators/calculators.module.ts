import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CalculatorsController } from "./calculators.controller";
import { CalculatorsService } from "./calculators.service";

@Module({
  imports: [AuthModule],
  controllers: [CalculatorsController],
  providers: [CalculatorsService],
  exports: [CalculatorsService],
})
export class CalculatorsModule {}
