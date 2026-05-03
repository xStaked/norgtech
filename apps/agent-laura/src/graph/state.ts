import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type {
  AgendaItem,
  AgentMode,
  ClarificationOption,
  ProposalPayload,
} from "../types.js";

export const LauraState = Annotation.Root({
  sessionId: Annotation<string>,
  userId: Annotation<string>,
  messages: Annotation<BaseMessage[]>,
  mode: Annotation<AgentMode>,

  customerContext: Annotation<{ id: string; label: string } | null>,
  opportunityContext: Annotation<{ id: string; label: string } | null>,

  clarificationOptions: Annotation<{
    type: string;
    options: ClarificationOption[];
  } | null>,

  proposal: Annotation<ProposalPayload | null>,
  proposalId: Annotation<string | null>,
  proposalStatus: Annotation<"draft" | "confirmed" | "discarded">,

  agendaItems: Annotation<AgendaItem[] | null>,

  lastError: Annotation<string | null>,

  _extractionResult: Annotation<Record<string, unknown> | null>,
});

export type LauraStateType = typeof LauraState.State;