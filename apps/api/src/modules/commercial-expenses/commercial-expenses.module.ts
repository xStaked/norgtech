import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { CommercialExpensesController } from "./commercial-expenses.controller";
import { CommercialExpensesExportService } from "./commercial-expenses-export.service";
import { CommercialExpensesService } from "./commercial-expenses.service";
import { R2StorageService } from "./r2-storage.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CommercialExpensesController],
  providers: [
    CommercialExpensesService,
    CommercialExpensesExportService,
    R2StorageService,
  ],
  exports: [CommercialExpensesService],
})
export class CommercialExpensesModule {}
