export interface LauraProposalPayload {
  blocks: {
    interaction?: {
      enabled: boolean;
      summary: string;
      rawMessage: string;
    };
    opportunity?: {
      enabled: boolean;
      opportunityId?: string;
      createNew?: boolean;
      title?: string;
      stage?: string;
    };
    followUp?: {
      enabled: boolean;
      title: string;
      dueAt: string;
      opportunityId?: string;
      type: string;
    };
    task?: {
      enabled: boolean;
      title: string;
      dueAt?: string;
      notes?: string;
    };
    signals?: {
      enabled: boolean;
      objections: string[];
      risk?: string;
      buyingIntent?: string;
    };
  };
}

export interface LauraAgendaItem {
  id: string;
  type: "visit" | "follow_up_task";
  label: string;
  scheduledAt?: string;
  priorityGroup?: number;
}

export type LauraAssistantResponse =
  | {
      mode: "greeting";
      sessionId: string;
      message: string;
    }
  | {
      mode: "clarification";
      sessionId: string;
      message: string;
      clarification: {
        type: "customer" | "opportunity" | "date" | "action";
        options?: Array<{ id: string; label: string }>;
      };
    }
  | {
      mode: "proposal";
      sessionId: string;
      message: string;
      proposalId: string;
      proposal: LauraProposalPayload;
    }
  | {
      mode: "agenda";
      sessionId: string;
      message: string;
      agenda: {
        items: LauraAgendaItem[];
      };
    };

export interface LauraSessionResponse {
  id: string;
  ownerUserId: string;
  contextType?: string | null;
  contextEntityId?: string | null;
  messages: Array<{
    id: string;
    role: string;
    kind: string;
    content: string;
    payload?: unknown;
    createdAt: string;
  }>;
  proposals: Array<{
    id: string;
    status: string;
    payload: unknown;
    createdAt: string;
    updatedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface LauraProposalConfirmationResponse {
  proposalId: string;
  status: "confirmed";
  proposal: LauraProposalPayload;
  saved: string[];
  discarded: string[];
  createdIds: Record<string, string>;
}

export type LauraMessageStatus = "pending" | "confirmed" | "error";

export interface LauraMessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  kind: string;
  content: string;
  createdAt: string;
  status?: LauraMessageStatus;
}

export interface LauraDraftProposal {
  proposalId: string;
  proposal: LauraProposalPayload;
  status?: string;
}
