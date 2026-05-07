import type { BaseMessage } from "@langchain/core/messages";
import type { LauraState } from "../graph/state.js";
import type { AgendaItem, ProposalPayload } from "../types.js";
import type { PlatformContext } from "./types.js";

export interface LauraPlatformContext extends PlatformContext {
  customerContext: LauraState["customerContext"];
  opportunityContext: LauraState["opportunityContext"];
  currentMessage: string;
  recentMessages: string[];
  agendaSummary?: string;
  activeProposal?: ProposalPayload;
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }

  if (content == null) {
    return "";
  }

  return String(content);
}

function messageToString(message: BaseMessage): string {
  return stringifyContent(message.content).trim();
}

function compactAgendaSummary(items: AgendaItem[]): string {
  return items
    .slice(0, 5)
    .map((item) => {
      const when = item.scheduledAt ? ` @ ${item.scheduledAt}` : "";
      return `${item.type}: ${item.label}${when}`;
    })
    .join(" | ");
}

export function buildPlatformContext(state: LauraState): LauraPlatformContext {
  const recentMessages = state.messages.map(messageToString).filter(Boolean).slice(-8);

  return {
    userId: state.userId,
    sessionId: state.sessionId,
    mentionedEntities: { ...state.mentionedEntities },
    customerContext: state.customerContext,
    opportunityContext: state.opportunityContext,
    currentMessage: recentMessages.at(-1) ?? "",
    recentMessages,
    agendaSummary: state.agendaItems?.length ? compactAgendaSummary(state.agendaItems) : undefined,
    activeProposal: state.proposalStatus === "draft" && state.proposal ? state.proposal : undefined,
  };
}
