import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { CreditModule } from "../credit/credit.module";
import { OrdersController } from "./orders.controller";
import { OrderXlsxExportService } from "./order-xlsx-export.service";
import { OrdersService } from "./orders.service";

@Module({
  imports: [AuthModule, AuditModule, CreditModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderXlsxExportService],
  exports: [OrdersService],
})
export class OrdersModule {}
