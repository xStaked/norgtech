import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { ProposalPayload, ClarificationPayload, AgendaItem, MentionedEntities, DataResult } from "../types";
import type { AgentMode } from "../types";

export const LauraState = Annotation.Root({
  sessionId: Annotation<string>,
  userId: Annotation<string>,
  messages: Annotation<BaseMessage[]>({
    reducer: (prev: BaseMessage[], next: BaseMessage[]) => [...prev, ...next],
    default: () => [],
  }),
  mode: Annotation<AgentMode>,
  customerContext: Annotation<{ id: string; label: string } | null>({
    reducer: (_prev: { id: string; label: string } | null, next: { id: string; label: string } | null) => next,
    default: () => null,
  }),
  opportunityContext: Annotation<{ id: string; label: string } | null>({
    reducer: (_prev: { id: string; label: string } | null, next: { id: string; label: string } | null) => next,
    default: () => null,
  }),
  clarificationOptions: Annotation<ClarificationPayload | null>({
    reducer: (_prev: ClarificationPayload | null, next: ClarificationPayload | null) => next,
    default: () => null,
  }),
  proposal: Annotation<ProposalPayload | null>({
    reducer: (_prev: ProposalPayload | null, next: ProposalPayload | null) => next,
    default: () => null,
  }),
  proposalId: Annotation<string | null>({
    reducer: (_prev: string | null, next: string | null) => next,
    default: () => null,
  }),
  proposalStatus: Annotation<"draft" | "confirmed" | "discarded">({
    reducer: (_prev: "draft" | "confirmed" | "discarded", next: "draft" | "confirmed" | "discarded") => next,
    default: () => "draft" as const,
  }),
  agendaItems: Annotation<AgendaItem[] | null>({
    reducer: (_prev: AgendaItem[] | null, next: AgendaItem[] | null) => next,
    default: () => null,
  }),
  lastError: Annotation<string | null>({
    reducer: (_prev: string | null, next: string | null) => next,
    default: () => null,
  }),
  _extractionResult: Annotation<Record<string, unknown> | null>({
    reducer: (_prev: Record<string, unknown> | null, next: Record<string, unknown> | null) => next,
    default: () => null,
  }),
  mentionedEntities: Annotation<MentionedEntities>({
    reducer: (prev: MentionedEntities, next: MentionedEntities) => ({ ...prev, ...next }),
    default: () => ({} as MentionedEntities),
  }),
  data: Annotation<DataResult | null>({
    reducer: (_prev: DataResult | null, next: DataResult | null) => next,
    default: () => null,
  }),
});

export type LauraState = typeof LauraState.State;
