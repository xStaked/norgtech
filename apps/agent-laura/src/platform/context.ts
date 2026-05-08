import type { BaseMessage } from "@langchain/core/messages";
import type { LauraState } from "../graph/state.js";
import type { AgendaItem, ProposalPayload, ProposalSummary } from "../types.js";
import type { PlatformContext } from "./types.js";

export interface LauraPlatformContext extends PlatformContext {
  customerContext: LauraState["customerContext"];
  opportunityContext: LauraState["opportunityContext"];
  currentMessage: string;
  recentMessages: string[];
  agendaSummary?: string;
  activeProposal: ProposalPayload | null;
  activeProposalSummary?: {
    primaryCount: number;
    relatedCount: number;
    primaryActions?: string[];
    relatedActions?: string[];
    relatedToIds?: string[];
    labels?: string[];
  };
  relatedEntities: {
    openFollowUpIds: string[];
    openQuoteIds: string[];
    openOrderIds: string[];
    upcomingVisitIds: string[];
  };
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

function proposalSummary(proposal: ProposalPayload | null): LauraPlatformContext["activeProposalSummary"] {
  const summary = proposal?.summary;
  if (!summary) {
    return undefined;
  }

  return {
    primaryCount: summary.primaryCount,
    relatedCount: summary.relatedCount,
    primaryActions: summary.primaryActions,
    relatedActions: summary.relatedActions,
    relatedToIds: summary.relatedToIds,
    labels: summary.labels,
  };
}

function activeProposalIds(proposal: ProposalPayload | null): LauraPlatformContext["relatedEntities"] {
  const quoteId = proposal?.blocks.quote?.id;
  const orderId = proposal?.blocks.order?.id;
  const followUpId = proposal?.blocks.followUp?.id;
  const visitId = proposal?.blocks.visit?.id;

  return {
    openFollowUpIds: typeof followUpId === "string" ? [followUpId] : [],
    openQuoteIds: typeof quoteId === "string" ? [quoteId] : [],
    openOrderIds: typeof orderId === "string" ? [orderId] : [],
    upcomingVisitIds: typeof visitId === "string" ? [visitId] : [],
  };
}

function mergeRelatedEntityIds(
  target: LauraPlatformContext["relatedEntities"],
  summary: ProposalSummary | undefined,
): LauraPlatformContext["relatedEntities"] {
  for (const id of summary?.relatedToIds ?? []) {
    if (/followup/i.test(id)) {
      target.openFollowUpIds.push(id);
      continue;
    }
    if (/quote/i.test(id)) {
      target.openQuoteIds.push(id);
      continue;
    }
    if (/order/i.test(id)) {
      target.openOrderIds.push(id);
      continue;
    }
    if (/visit/i.test(id)) {
      target.upcomingVisitIds.push(id);
    }
  }

  return {
    openFollowUpIds: Array.from(new Set(target.openFollowUpIds)),
    openQuoteIds: Array.from(new Set(target.openQuoteIds)),
    openOrderIds: Array.from(new Set(target.openOrderIds)),
    upcomingVisitIds: Array.from(new Set(target.upcomingVisitIds)),
  };
}

function relatedEntities(state: LauraState, activeProposal: ProposalPayload | null): LauraPlatformContext["relatedEntities"] {
  const proposalIds = activeProposalIds(activeProposal);
  const agendaFollowUpIds = (state.agendaItems ?? [])
    .filter((item) => item.type === "follow_up_task")
    .map((item) => item.id);
  const agendaVisitIds = (state.agendaItems ?? [])
    .filter((item) => item.type === "visit")
    .map((item) => item.id);

  return mergeRelatedEntityIds({
    openFollowUpIds: Array.from(new Set([
      ...proposalIds.openFollowUpIds,
      ...agendaFollowUpIds,
      ...(typeof state.mentionedEntities.followupId === "string" ? [state.mentionedEntities.followupId] : []),
    ])),
    openQuoteIds: Array.from(new Set([
      ...proposalIds.openQuoteIds,
      ...(typeof state.mentionedEntities.quoteId === "string" ? [state.mentionedEntities.quoteId] : []),
    ])),
    openOrderIds: Array.from(new Set([
      ...proposalIds.openOrderIds,
      ...(typeof state.mentionedEntities.orderId === "string" ? [state.mentionedEntities.orderId] : []),
    ])),
    upcomingVisitIds: Array.from(new Set([
      ...proposalIds.upcomingVisitIds,
      ...agendaVisitIds,
      ...(typeof state.mentionedEntities.visitId === "string" ? [state.mentionedEntities.visitId] : []),
    ])),
  }, activeProposal?.summary);
}

export function buildPlatformContext(state: LauraState): LauraPlatformContext {
  const recentMessages = state.messages.map(messageToString).filter(Boolean).slice(-16);
  const activeProposal = state.proposalStatus === "draft" && state.proposal ? state.proposal : null;

  return {
    userId: state.userId,
    sessionId: state.sessionId,
    mentionedEntities: { ...state.mentionedEntities },
    customerContext: state.customerContext,
    opportunityContext: state.opportunityContext,
    currentMessage: recentMessages.at(-1) ?? "",
    recentMessages,
    agendaSummary: state.agendaItems?.length ? compactAgendaSummary(state.agendaItems) : undefined,
    activeProposal,
    activeProposalSummary: proposalSummary(activeProposal),
    relatedEntities: relatedEntities(state, activeProposal),
  };
}
