import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import {
  ExpenseExtractionProvider,
  OpenAIExpenseExtractionProvider,
} from "../commercial-expenses/commercial-expense-extraction.provider";
import { OrdersModule } from "../orders/orders.module";
import { KapsoWebhookService } from "./kapso-webhook.service";
import { NoraCaseService } from "./nora-case.service";
import { NoraExpenseExtractionService } from "./nora-expense-extraction.service";
import { NoraRoutingService } from "./nora-routing.service";
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";
import { WhatsAppController, WhatsAppWebhookController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  imports: [AuthModule, forwardRef(() => OrdersModule)],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [
    WhatsAppService,
    WhatsAppOrderAutomationService,
    KapsoWebhookService,
    NoraCaseService,
    NoraExpenseExtractionService,
    NoraRoutingService,
    {
      provide: ExpenseExtractionProvider,
      useClass: OpenAIExpenseExtractionProvider,
    },
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
