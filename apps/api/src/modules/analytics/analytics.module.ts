import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SellerGoalsModule } from "../seller-goals/seller-goals.module";
import { AnalyticsController } from "./analytics.controller";
import { FunnelService } from "./funnel.service";
import { ReceivablesService } from "./receivables.service";
import { SalesService } from "./sales.service";
import { SellerPerformanceService } from "./seller-performance.service";
import { SellerReportService } from "./seller-report.service";

@Module({
  // `seller-goals` entra solo para el avance de meta del informe en PDF: se
  // reusa su calculo (y su control de acceso) en vez de recalcular la meta aca.
  imports: [AuthModule, SellerGoalsModule],
  controllers: [AnalyticsController],
  providers: [
    SalesService,
    ReceivablesService,
    FunnelService,
    SellerPerformanceService,
    SellerReportService,
  ],
})
export class AnalyticsModule {}
