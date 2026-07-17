import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOrderDto } from "../orders/dto/create-order.dto";
import { CreateInternalNoteDto } from "./dto/create-internal-note.dto";
import { KapsoWebhookDto } from "./dto/kapso-webhook.dto";
import { ProcessOrderAutomationDto } from "./dto/process-order-automation.dto";
import { SendWhatsAppMessageDto } from "./dto/send-whatsapp-message.dto";
import { UpdateConversationDto } from "./dto/update-conversation.dto";
import { KapsoWebhookService } from "./kapso-webhook.service";
import { WhatsAppService } from "./whatsapp.service";

@Controller("whatsapp/webhooks")
export class WhatsAppWebhookController {
  constructor(private readonly kapsoWebhookService: KapsoWebhookService) {}

  @Post("kapso")
  receiveKapsoWebhook(
    @Body(
      new ValidationPipe({
        whitelist: false,
        forbidNonWhitelisted: false,
      }),
    )
    dto: KapsoWebhookDto,
  ) {
    return this.kapsoWebhookService.handle(dto);
  }
}

@Controller("whatsapp")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  "administrador",
  "director_comercial",
  "comercial",
  "tecnico",
  "facturacion",
  "logistica",
)
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get("conversations")
  listConversations(@CurrentUser() user: AuthUser) {
    return this.whatsAppService.listConversations(user);
  }

  @Get("conversations/pending-count")
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.whatsAppService.pendingCount(user);
  }

  @Get("conversations/:id")
  getConversation(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.whatsAppService.getConversation(user, id);
  }

  @Patch("conversations/:id")
  updateConversation(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateConversationDto,
  ) {
    return this.whatsAppService.updateConversation(id, dto);
  }

  @Post("conversations/:id/notes")
  createNote(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateInternalNoteDto,
  ) {
    return this.whatsAppService.createNote(user, id, dto.body);
  }

  @Post("conversations/:id/messages")
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: SendWhatsAppMessageDto,
  ) {
    return this.whatsAppService.sendMessage(user, id, dto);
  }

  @Post("conversations/:id/claim")
  claimConversation(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.whatsAppService.claimConversation(user, id);
  }

  @Post("conversations/:id/order-draft")
  createOrderDraft(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateOrderDto,
  ) {
    return this.whatsAppService.createOrderDraft(user, id, dto);
  }

  @Post("conversations/:id/order-automation")
  processOrderAutomation(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: ProcessOrderAutomationDto,
  ) {
    return this.whatsAppService.processOrderAutomation(user, id, dto);
  }

  @Post("conversations/:id/cases/:caseId/create-order")
  createOrderFromCase(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("caseId") caseId: string,
  ) {
    return this.whatsAppService.createOrderFromCase(user, id, caseId);
  }
}
