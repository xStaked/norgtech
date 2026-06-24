import { forwardRef, Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import {
  ExpenseExtractionProvider,
  OpenAIExpenseExtractionProvider,
} from "./commercial-expense-extraction.provider";
import { CommercialExpenseExtractionService } from "./commercial-expense-extraction.service";
import { CommercialExpensesController } from "./commercial-expenses.controller";
import { CommercialExpensesExportService } from "./commercial-expenses-export.service";
import { CommercialExpensesService } from "./commercial-expenses.service";
import { R2StorageService } from "./r2-storage.service";

@Module({
  imports: [AuthModule, AuditModule, forwardRef(() => WhatsAppModule)],
  controllers: [CommercialExpensesController],
  providers: [
    CommercialExpensesService,
    CommercialExpensesExportService,
    CommercialExpenseExtractionService,
    {
      provide: ExpenseExtractionProvider,
      useClass: OpenAIExpenseExtractionProvider,
    },
    R2StorageService,
  ],
  exports: [CommercialExpensesService],
})
export class CommercialExpensesModule {}
