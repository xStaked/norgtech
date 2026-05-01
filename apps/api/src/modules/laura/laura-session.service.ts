import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LauraMessageKind, LauraMessageRole, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type SessionInput = {
  sessionId?: string;
  contextType?: string;
  contextEntityId?: string;
};

type LauraSessionClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LauraSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSession(userId: string, input?: SessionInput, client?: LauraSessionClient) {
    const db = client ?? this.prisma;

    if (!input?.sessionId) {
      return db.lauraSession.create({
        data: {
          ownerUserId: userId,
          contextType: input?.contextType,
          contextEntityId: input?.contextEntityId,
        },
      });
    }

    const session = await db.lauraSession.findUnique({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new NotFoundException("Laura session not found");
    }

    if (session.ownerUserId !== userId) {
      throw new ForbiddenException("Laura session does not belong to the current user");
    }

    return session;
  }

  async appendUserMessage(
    sessionId: string,
    kind: LauraMessageKind,
    content: string,
    payload?: Prisma.InputJsonValue,
    client?: LauraSessionClient,
  ) {
    const db = client ?? this.prisma;

    return db.lauraMessage.create({
      data: {
        sessionId,
        role: LauraMessageRole.user,
        kind,
        content,
        payload: payload ?? undefined,
      },
    });
  }

  async appendAssistantMessage(
    sessionId: string,
    kind: LauraMessageKind,
    content: string,
    payload?: Prisma.InputJsonValue,
    client?: LauraSessionClient,
  ) {
    const db = client ?? this.prisma;

    return db.lauraMessage.create({
      data: {
        sessionId,
        role: LauraMessageRole.assistant,
        kind,
        content,
        payload: payload ?? undefined,
      },
    });
  }

  async getRecentMessages(sessionId: string, limit = 12, client?: LauraSessionClient) {
    const db = client ?? this.prisma;

    return db.lauraMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async getLatestPendingClarification(sessionId: string, client?: LauraSessionClient) {
    const messages = await this.getRecentMessages(sessionId, 12, client);

    for (const message of messages) {
      if (
        message.role === LauraMessageRole.assistant
        && message.kind === LauraMessageKind.clarification
      ) {
        const payload = message.payload as
          | {
            pending?: boolean;
            clarification?: {
              type?: "customer" | "opportunity" | "date" | "action";
              options?: Array<{ id: string; label: string }>;
            };
            sourceMessage?: {
              kind: LauraMessageKind;
              content: string;
            };
          }
          | null;

        if (payload?.pending) {
          return {
            ...message,
            payload,
          };
        }
      }

      if (message.role === LauraMessageRole.assistant) {
        return null;
      }
    }

    return null;
  }

  async getLatestDraftProposal(sessionId: string, client?: LauraSessionClient) {
    const db = client ?? this.prisma;

    const proposals = await db.lauraProposal.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    return proposals[0] ?? null;
  }
}
