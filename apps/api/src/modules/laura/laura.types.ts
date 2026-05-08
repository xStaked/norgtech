export interface LauraClarificationOption {
  id: string;
  label: string;
}

import { FollowUpTaskType, OpportunityStage } from "@prisma/client";

export interface LauraProposalPayload {
  blocks: {
    interaction?: {
      enabled: boolean;
      relatedTo?: string;
      summary: string;
      rawMessage: string;
    };
    opportunity?: {
      enabled: boolean;
      customerId?: string;
      opportunityId?: string;
      relatedTo?: string;
      createNew?: boolean;
      title?: string;
      stage?: OpportunityStage;
      estimatedValue?: number;
      expectedCloseDate?: string;
    };
    followUp?: {
      enabled: boolean;
      customerId?: string;
      relatedTo?: string;
      title?: string;
      dueAt?: string;
      opportunityId?: string;
      type?: FollowUpTaskType;
    };
    task?: {
      enabled: boolean;
      title: string;
      dueAt?: string;
      notes?: string;
      customerId?: string;
      relatedTo?: string;
    };
    signals?: {
      enabled: boolean;
      relatedTo?: string;
      objections: string[];
      risk?: string;
      buyingIntent?: string;
    };
    customer?: {
      enabled: boolean;
      action: "create" | "update" | "delete";
      id?: string;
      relatedTo?: string;
      legalName?: string;
      displayName?: string;
      taxId?: string;
      phone?: string;
      email?: string;
      address?: string;
      city?: string;
      department?: string;
      notes?: string;
      segmentId?: string;
      assignedToUserId?: string;
    };
    contact?: {
      enabled: boolean;
      action: "create" | "update" | "delete";
      id?: string;
      relatedTo?: string;
      customerId?: string;
      fullName?: string;
      roleTitle?: string;
      phone?: string;
      email?: string;
      isPrimary?: boolean;
      notes?: string;
    };
    quote?: {
      enabled: boolean;
      action: "create" | "update" | "delete";
      id?: string;
      relatedTo?: string;
      customerId?: string;
      opportunityId?: string;
      validUntil?: string;
      notes?: string;
      items?: Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }>;
    };
    order?: {
      enabled: boolean;
      action: "create" | "update" | "delete";
      id?: string;
      relatedTo?: string;
      customerId?: string;
      opportunityId?: string;
      sourceQuoteId?: string;
      notes?: string;
      items?: Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }>;
    };
    product?: {
      enabled: boolean;
      action: "create" | "update" | "delete";
      id?: string;
      relatedTo?: string;
      sku?: string;
      name?: string;
      description?: string;
      unit?: string;
      presentation?: string;
      basePrice?: number;
    };
    segment?: {
      enabled: boolean;
      action: "create" | "update" | "delete";
      id?: string;
      relatedTo?: string;
      name?: string;
      description?: string;
    };
    visit?: {
      enabled: boolean;
      action: "create" | "update" | "delete";
      id?: string;
      relatedTo?: string;
      customerId?: string;
      opportunityId?: string;
      scheduledAt?: string;
      summary?: string;
      notes?: string;
    };
  };
}

export interface LauraProposalExecutionError {
  block: string;
  message: string;
}

export interface LauraProposalExecutionResult {
  saved: string[];
  discarded: string[];
  createdIds: Record<string, string>;
  errors: LauraProposalExecutionError[];
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
    }
  | {
      mode: "qa";
      sessionId: string;
      message: string;
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
  errors?: LauraProposalExecutionError[];
}
