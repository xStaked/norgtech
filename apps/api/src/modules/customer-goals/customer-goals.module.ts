import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CustomerGoalsController } from "./customer-goals.controller";
import { CustomerGoalsService } from "./customer-goals.service";

@Module({
  imports: [AuthModule],
  controllers: [CustomerGoalsController],
  providers: [CustomerGoalsService],
  exports: [CustomerGoalsService],
})
export class CustomerGoalsModule {}
