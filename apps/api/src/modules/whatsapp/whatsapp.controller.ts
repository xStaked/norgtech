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
import { CreateInternalNoteDto } from "./dto/create-internal-note.dto";
import { KapsoWebhookDto } from "./dto/kapso-webhook.dto";
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
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: KapsoWebhookDto,
  ) {
    return this.kapsoWebhookService.handle(dto);
  }
}

@Controller("whatsapp")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("administrador", "comercial", "director_comercial")
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get("conversations")
  listConversations() {
    return this.whatsAppService.listConversations();
  }

  @Get("conversations/:id")
  getConversation(@Param("id") id: string) {
    return this.whatsAppService.getConversation(id);
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
}
