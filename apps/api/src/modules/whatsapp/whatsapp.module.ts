import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  ExpenseExtractionProvider,
  OpenAIExpenseExtractionProvider,
} from "../commercial-expenses/commercial-expense-extraction.provider";
import { CommercialExpensesModule } from "../commercial-expenses/commercial-expenses.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersModule } from "../orders/orders.module";
import { VisitsModule } from "../visits/visits.module";
import { KapsoWebhookService } from "./kapso-webhook.service";
import { NoraCaseService } from "./nora-case.service";
import { NoraAgentController } from "./nora-agent.controller";
import { NoraExpenseExtractionService } from "./nora-expense-extraction.service";
import { NoraExpenseExecutionService } from "./nora-expense-execution.service";
import { NoraRoutingService } from "./nora-routing.service";
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";
import { WhatsAppController, WhatsAppWebhookController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  imports: [
    AuthModule,
    forwardRef(() => CommercialExpensesModule),
    forwardRef(() => OrdersModule),
    NotificationsModule,
    VisitsModule,
  ],
  controllers: [WhatsAppController, WhatsAppWebhookController, NoraAgentController],
  providers: [
    WhatsAppService,
    WhatsAppOrderAutomationService,
    KapsoWebhookService,
    NoraCaseService,
    NoraExpenseExtractionService,
    NoraExpenseExecutionService,
    NoraRoutingService,
    {
      provide: ExpenseExtractionProvider,
      useClass: OpenAIExpenseExtractionProvider,
    },
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
