import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SellerGoalsController } from "./seller-goals.controller";
import { SellerGoalsService } from "./seller-goals.service";

@Module({
  imports: [AuthModule],
  controllers: [SellerGoalsController],
  providers: [SellerGoalsService],
  exports: [SellerGoalsService],
})
export class SellerGoalsModule {}
