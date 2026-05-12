export type LauraCustomerBlock = {
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
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
  relatedTo?: string;
};

export type LauraContactBlock = {
  customerId?: string;
  fullName?: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
  relatedTo?: string;
};

export type LauraQuoteBlock = {
  customerId: string;
  opportunityId?: string;
  validUntil?: string;
  notes?: string;
  items?: Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }>;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
  relatedTo?: string;
};

export type LauraOrderBlock = {
  customerId: string;
  opportunityId?: string;
  sourceQuoteId?: string;
  notes?: string;
  items?: Array<{ productId: string; quantity: number; unitPrice: number; notes?: string }>;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
  relatedTo?: string;
};

export type LauraProductBlock = {
  sku?: string;
  name?: string;
  description?: string;
  unit?: string;
  presentation?: string;
  basePrice?: number;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
  relatedTo?: string;
};

export type LauraSegmentBlock = {
  name?: string;
  description?: string;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
  relatedTo?: string;
};

export type LauraVisitBlock = {
  customerId?: string;
  opportunityId?: string;
  scheduledAt?: string;
  summary?: string;
  notes?: string;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
  relatedTo?: string;
};

export interface NoraProposalSummaryMeta {
  primaryCount: number;
  relatedCount: number;
  primaryActions: string[];
  relatedActions: string[];
  relatedToIds: string[];
  labels: string[];
}

export interface LauraAdaptiveReadMeta {
  responseStyle: "brief" | "adaptive";
  riskLabel?: string;
  relatedEntities?: string[];
}

export interface NoraProposalPayload {
  blocks: {
    interaction?: LauraInteractionBlock;
    opportunity?: LauraOpportunityBlock;
    followUp?: LauraFollowUpBlock;
    task?: LauraTaskBlock;
    signals?: LauraSignalsBlock;
    customer?: LauraCustomerBlock;
    contact?: LauraContactBlock;
    quote?: LauraQuoteBlock;
    order?: LauraOrderBlock;
    product?: LauraProductBlock;
    segment?: LauraSegmentBlock;
    visit?: LauraVisitBlock;
  };
  summary?: NoraProposalSummaryMeta;
}

export type LauraInteractionBlock = {
  enabled: boolean;
  summary: string;
  rawMessage: string;
  relatedTo?: string;
};

export type LauraOpportunityBlock = {
  enabled: boolean;
  customerId?: string;
  opportunityId?: string;
  createNew?: boolean;
  title?: string;
  stage?: string;
  relatedTo?: string;
};

export type LauraFollowUpBlock = {
  enabled: boolean;
  customerId?: string;
  title?: string;
  dueAt?: string;
  opportunityId?: string;
  type?: string;
  relatedTo?: string;
};

export type LauraTaskBlock = {
  enabled: boolean;
  title: string;
  dueAt?: string;
  notes?: string;
  customerId?: string;
  relatedTo?: string;
};

export type LauraSignalsBlock = {
  enabled: boolean;
  objections: string[];
  risk?: string;
  buyingIntent?: string;
  relatedTo?: string;
};

export interface NoraAgendaItem {
  id: string;
  type: "visit" | "follow_up_task";
  label: string;
  scheduledAt?: string;
  priorityGroup?: number;
}

export type NoraAssistantResponse =
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
      proposal: NoraProposalPayload;
    }
  | {
      mode: "agenda";
      sessionId: string;
      message: string;
      agenda: {
        items: NoraAgendaItem[];
      };
    }
  | {
      mode: "qa";
      sessionId: string;
      message: string;
    }
  | {
      mode: "query";
      sessionId: string;
      message: string;
      data?: {
        entityType: string;
        action: "list" | "detail";
        data: unknown;
        summary: string;
        meta?: LauraAdaptiveReadMeta;
      };
    }
  | {
      mode: "modify";
      sessionId: string;
      message: string;
      proposalId: string;
      proposal: NoraProposalPayload;
    }
  | {
      mode: "confirm" | "discard" | "refine";
      sessionId: string;
      message: string;
    };

export interface NoraSessionResponse {
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

export interface LauraProposalExecutionError {
  block: string;
  message: string;
}

export interface NoraProposalConfirmationResponse {
  proposalId: string;
  status: "confirmed";
  proposal: NoraProposalPayload;
  saved: string[];
  discarded: string[];
  createdIds: Record<string, string>;
  errors?: LauraProposalExecutionError[];
}

export type NoraMessageStatus = "pending" | "confirmed" | "error";

export interface NoraMessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  kind: string;
  content: string;
  createdAt: string;
  status?: NoraMessageStatus;
}

export interface NoraDraftProposal {
  proposalId: string;
  proposal: NoraProposalPayload;
  status?: string;
}
