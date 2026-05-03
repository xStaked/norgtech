export interface ProposalInteractionBlock {
  enabled: boolean;
  summary: string;
  rawMessage: string;
}

export interface ProposalOpportunityBlock {
  enabled: boolean;
  opportunityId?: string;
  createNew?: boolean;
  title?: string;
  stage?: string;
}

export interface ProposalFollowUpBlock {
  enabled: boolean;
  title: string;
  dueAt: string;
  opportunityId?: string;
  type: string;
}

export interface ProposalTaskBlock {
  enabled: boolean;
  title: string;
  dueAt?: string;
  notes?: string;
}

export interface ProposalSignalsBlock {
  enabled: boolean;
  objections: string[];
  risk?: string;
  buyingIntent?: string;
}

export interface ProposalPayload {
  blocks: {
    interaction?: ProposalInteractionBlock;
    opportunity?: ProposalOpportunityBlock;
    followUp?: ProposalFollowUpBlock;
    task?: ProposalTaskBlock;
    signals?: ProposalSignalsBlock;
  };
}

export interface ClarificationOption {
  id: string;
  label: string;
}

export interface AgendaItem {
  id: string;
  type: "visit" | "follow_up_task";
  label: string;
  scheduledAt?: string;
  priorityGroup?: number;
}

export type AgentMode = "greeting" | "clarification" | "proposal" | "agenda" | "confirm" | "discard" | "refine";

export interface AgentResponse {
  mode: AgentMode;
  sessionId: string;
  message: string;
  clarification?: {
    type: "customer" | "opportunity" | "date" | "action";
    options?: ClarificationOption[];
  };
  proposalId?: string;
  proposal?: ProposalPayload;
  agenda?: {
    items: AgendaItem[];
  };
  confirmation?: {
    proposalId: string;
    status: "confirmed";
    saved: string[];
    discarded: string[];
    createdIds: Record<string, string>;
  };
}