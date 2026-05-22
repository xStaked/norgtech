import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { KapsoWebhookService } from "./kapso-webhook.service";
import { WhatsAppController, WhatsAppWebhookController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";

@Module({
  imports: [AuthModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, KapsoWebhookService],
})
export class WhatsAppModule {}
