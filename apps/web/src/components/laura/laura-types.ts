export type LauraCustomerBlock = {
  legalName: string;
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
};

export type LauraContactBlock = {
  customerId: string;
  fullName: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
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
};

export type LauraProductBlock = {
  sku: string;
  name: string;
  description?: string;
  unit?: string;
  presentation?: string;
  basePrice?: number;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
};

export type LauraSegmentBlock = {
  name: string;
  description?: string;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
};

export type LauraVisitBlock = {
  customerId: string;
  opportunityId?: string;
  scheduledAt: string;
  summary?: string;
  notes?: string;
  enabled: boolean;
  action: "create" | "update" | "delete";
  id?: string;
};

export interface LauraProposalPayload {
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
}

export type LauraInteractionBlock = {
  enabled: boolean;
  summary: string;
  rawMessage: string;
};

export type LauraOpportunityBlock = {
  enabled: boolean;
  opportunityId?: string;
  createNew?: boolean;
  title?: string;
  stage?: string;
};

export type LauraFollowUpBlock = {
  enabled: boolean;
  title: string;
  dueAt: string;
  opportunityId?: string;
  type: string;
};

export type LauraTaskBlock = {
  enabled: boolean;
  title: string;
  dueAt?: string;
  notes?: string;
};

export type LauraSignalsBlock = {
  enabled: boolean;
  objections: string[];
  risk?: string;
  buyingIntent?: string;
};

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
      };
    }
  | {
      mode: "modify";
      sessionId: string;
      message: string;
      proposalId: string;
      proposal: LauraProposalPayload;
    }
  | {
      mode: "confirm" | "discard" | "refine";
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
