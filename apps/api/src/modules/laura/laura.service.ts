import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LauraMessageKind,
  LauraMessageRole,
  LauraProposalStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { ConfirmProposalDto } from "./dto/confirm-proposal.dto";
import { CreateMessageDto } from "./dto/create-message.dto";
import { QuerySessionDto } from "./dto/query-session.dto";
import {
  LauraAssistantResponse,
  LauraProposalConfirmationResponse,
  LauraProposalPayload,
  LauraSessionResponse,
} from "./laura.types";

const AMBIGUOUS_CUSTOMER_MESSAGE = "Encontré varios clientes que coinciden con Perez. ¿Cuál es?";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type LauraTransaction = Prisma.TransactionClient;

@Injectable()
export class LauraService {
  constructor(private readonly prisma: PrismaService) {}

  async handleMessage(
    user: AuthUser,
    dto: CreateMessageDto,
  ): Promise<LauraAssistantResponse> {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.resolveOwnedSession(tx, user.id, dto);
      const userMessage = await tx.lauraMessage.create({
        data: {
          sessionId: session.id,
          role: LauraMessageRole.user,
          kind: LauraMessageKind.report,
          content: dto.content,
        },
      });

      if (/perez/i.test(dto.content)) {
        const response: LauraAssistantResponse = {
          mode: "clarification",
          sessionId: session.id,
          message: AMBIGUOUS_CUSTOMER_MESSAGE,
          clarification: {
            type: "customer",
            options: [
              { id: "customer-perez-a", label: "Perez Acuicola SAS" },
              { id: "customer-perez-b", label: "Perez Trading" },
            ],
          },
        };

        await tx.lauraMessage.create({
          data: {
            sessionId: session.id,
            role: LauraMessageRole.assistant,
            kind: LauraMessageKind.clarification,
            content: response.message,
            payload: toJsonValue(response),
          },
        });

        return response;
      }

      const proposalPayload = this.buildProposalPayload(dto.content);
      const proposal = await tx.lauraProposal.create({
        data: {
          sessionId: session.id,
          messageId: userMessage.id,
          status: LauraProposalStatus.draft,
          payload: toJsonValue(proposalPayload),
        },
      });

      const response: LauraAssistantResponse = {
        mode: "proposal",
        sessionId: session.id,
        message: "Preparé una propuesta inicial para que la revises antes de guardarla.",
        proposalId: proposal.id,
        proposal: proposalPayload,
      };

      await tx.lauraMessage.create({
        data: {
          sessionId: session.id,
          role: LauraMessageRole.assistant,
          kind: LauraMessageKind.proposal,
          content: response.message,
          payload: toJsonValue({
            proposalId: proposal.id,
            proposal: proposalPayload,
          }),
        },
      });

      return response;
    });
  }

  async confirmProposal(
    user: AuthUser,
    proposalId: string,
    dto: ConfirmProposalDto,
  ): Promise<LauraProposalConfirmationResponse> {
    const proposal = await this.prisma.lauraProposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException("Laura proposal not found");
    }

    await this.assertSessionOwner(user.id, proposal.sessionId);

    if (proposal.status !== LauraProposalStatus.draft) {
      throw new ConflictException("Laura proposal has already been finalized");
    }

    await this.prisma.lauraProposal.update({
      where: { id: proposalId },
      data: {
        status: LauraProposalStatus.confirmed,
        payload: toJsonValue(dto.proposal),
      },
    });

    return {
      proposalId,
      status: "confirmed",
      proposal: dto.proposal,
    };
  }

  async getSession(
    user: AuthUser,
    sessionId: string,
    query: QuerySessionDto,
  ): Promise<LauraSessionResponse> {
    const session = await this.prisma.lauraSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException("Laura session not found");
    }

    if (session.ownerUserId !== user.id) {
      throw new ForbiddenException("Laura session does not belong to the current user");
    }

    const includeMessages = query.includeMessages ?? true;
    const includeProposals = query.includeProposals ?? true;

    return {
      id: session.id,
      ownerUserId: session.ownerUserId,
      contextType: session.contextType,
      contextEntityId: session.contextEntityId,
      messages: includeMessages
        ? await this.prisma.lauraMessage.findMany({
          where: { sessionId },
          orderBy: { createdAt: "asc" },
        })
        : [],
      proposals: includeProposals
        ? await this.prisma.lauraProposal.findMany({
          where: { sessionId },
          orderBy: { createdAt: "asc" },
        })
        : [],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private buildProposalPayload(content: string): LauraProposalPayload {
    return {
      customer: {
        status: "resolved",
        selectedOption: {
          id: "customer-acme",
          label: "Acme Piscicola SAS",
        },
      },
      summary: content.trim(),
      suggestedActions: [
        "Programar visita comercial",
        "Preparar propuesta para alimento",
      ],
    };
  }

  private async resolveOwnedSession(
    tx: LauraTransaction,
    userId: string,
    dto: CreateMessageDto,
  ) {
    if (!dto.sessionId) {
      return tx.lauraSession.create({
        data: {
          ownerUserId: userId,
          contextType: dto.contextType,
          contextEntityId: dto.contextEntityId,
        },
      });
    }

    const session = await tx.lauraSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session) {
      throw new NotFoundException("Laura session not found");
    }

    if (session.ownerUserId !== userId) {
      throw new ForbiddenException("Laura session does not belong to the current user");
    }

    return session;
  }

  private async assertSessionOwner(userId: string, sessionId: string) {
    const session = await this.prisma.lauraSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException("Laura session not found");
    }

    if (session.ownerUserId !== userId) {
      throw new ForbiddenException("Laura session does not belong to the current user");
    }
  }
}
