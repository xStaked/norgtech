import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  Sse,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { Observable } from "rxjs";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { ConfirmProposalDto } from "./dto/confirm-proposal.dto";
import { CreateMessageDto } from "./dto/create-message.dto";
import { QuerySessionDto } from "./dto/query-session.dto";
import { LauraService } from "./laura.service";

@Controller("laura")
export class LauraController {
  constructor(private readonly lauraService: LauraService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Post("messages")
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateMessageDto,
  ) {
    if (this.lauraService.useAgent) {
      return this.lauraService.handleMessageViaAgent(user, dto);
    }
    return this.lauraService.handleMessage(user, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Post("proposals/:proposalId/confirm")
  confirmProposal(
    @CurrentUser() user: AuthUser,
    @Param("proposalId") proposalId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: ConfirmProposalDto,
  ) {
    if (this.lauraService.useAgent) {
      return this.lauraService.confirmProposalViaAgent(
        dto.proposal,
        dto.proposal.blocks.interaction?.enabled ? undefined : undefined,
        dto.proposal.blocks.opportunity?.opportunityId,
      );
    }
    return this.lauraService.confirmProposal(user, proposalId, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Get("sessions/:sessionId")
  getSession(
    @CurrentUser() user: AuthUser,
    @Param("sessionId") sessionId: string,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: QuerySessionDto,
  ) {
    return this.lauraService.getSession(user, sessionId, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Sse("messages/stream")
  streamMessage(
    @CurrentUser() user: AuthUser,
    @Query("content") content: string,
    @Query("sessionId") sessionId?: string,
    @Query("contextType") contextType?: string,
    @Query("contextEntityId") contextEntityId?: string,
  ) {
    const dto = new CreateMessageDto();
    dto.content = content;
    dto.sessionId = sessionId;
    dto.contextType = contextType;
    dto.contextEntityId = contextEntityId;

    if (this.lauraService.useAgent) {
      return this.lauraService.streamMessageViaAgent(user, dto);
    }

    return new Observable((subscriber) => {
      this.lauraService
        .handleMessage(user, dto)
        .then((result) => {
          subscriber.next({ data: JSON.stringify(result) });
          subscriber.complete();
        })
        .catch((error) => {
          subscriber.next({ data: JSON.stringify({ mode: "error", message: error.message }) });
          subscriber.complete();
        });
    });
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Post("messages/stream")
  async streamMessagePost(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateMessageDto,
    @Res() res: Response,
  ) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      if (this.lauraService.useAgent) {
        const observable = this.lauraService.streamMessageViaAgent(user, dto);
        await new Promise<void>((resolve, reject) => {
          observable.subscribe({
            next: (event) => {
              try {
                const parsed = JSON.parse(event.data) as Record<string, unknown>;
                sendEvent(parsed.event as string ?? "data", parsed);
              } catch {
                res.write(`data: ${event.data}\n\n`);
              }
            },
            error: (err) => {
              sendEvent("error", { message: err.message ?? "Stream error" });
              resolve();
            },
            complete: () => {
              sendEvent("done", { ok: true });
              resolve();
            },
          });
        });
      } else {
        const result = await this.lauraService.handleMessage(user, dto);
        sendEvent("result", result);
        sendEvent("done", { ok: true });
      }
    } catch (error) {
      sendEvent("error", {
        message: error instanceof Error ? error.message : "Internal error",
      });
    }

    res.end();
  }
}
