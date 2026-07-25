import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AnalyticsController } from "./analytics.controller";
import { FunnelService } from "./funnel.service";
import { ReceivablesService } from "./receivables.service";
import { SalesService } from "./sales.service";
import { SellerPerformanceService } from "./seller-performance.service";

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [SalesService, ReceivablesService, FunnelService, SellerPerformanceService],
})
export class AnalyticsModule {}
