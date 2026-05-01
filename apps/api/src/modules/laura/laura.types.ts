export interface LauraClarificationOption {
  id: string;
  label: string;
}

import { FollowUpTaskType, OpportunityStage } from "@prisma/client";

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
      stage?: OpportunityStage;
    };
    followUp?: {
      enabled: boolean;
      title: string;
      dueAt: string;
      opportunityId?: string;
      type: FollowUpTaskType;
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

export interface LauraStoredProposalPayload extends LauraProposalPayload {
  internal?: {
    customerId?: string;
    customerLabel?: string;
    opportunityId?: string;
    occurredAt?: string;
  };
}

export interface LauraAgendaPayload {
  items: Array<{
    id: string;
    type: "visit" | "follow_up_task";
    label: string;
    scheduledAt?: string;
    priorityGroup?: number;
  }>;
}

export type LauraAssistantResponse =
  | {
      mode: "clarification";
      sessionId: string;
      message: string;
      clarification: {
        type: "customer" | "opportunity" | "date" | "action";
        options?: LauraClarificationOption[];
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
      agenda: LauraAgendaPayload;
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
    createdAt: Date;
  }>;
  proposals: Array<{
    id: string;
    status: string;
    payload: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface LauraProposalConfirmationResponse {
  proposalId: string;
  status: "confirmed";
  proposal: LauraProposalPayload;
  saved: string[];
  discarded: string[];
  createdIds: Record<string, string>;
}
