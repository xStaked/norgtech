import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrdersModule } from "../orders/orders.module";
import { KapsoWebhookService } from "./kapso-webhook.service";
import { NoraCaseService } from "./nora-case.service";
import { NoraRoutingService } from "./nora-routing.service";
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";
import { WhatsAppController, WhatsAppWebhookController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [
    WhatsAppService,
    WhatsAppOrderAutomationService,
    KapsoWebhookService,
    NoraCaseService,
    NoraRoutingService,
  ],
})
export class WhatsAppModule {}
