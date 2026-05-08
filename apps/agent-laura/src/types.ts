import type { BaseMessage } from "@langchain/core/messages";

export type AgentMode =
  | "greeting"
  | "clarification"
  | "proposal"
  | "agenda"
  | "confirm"
  | "discard"
  | "refine"
  | "qa"
  | "platform"
  | "query"
  | "modify";

export type ProposalBlockAction = "create" | "update" | "delete";

export interface InteractionBlock {
  summary: string;
  rawMessage: string;
  enabled: boolean;
  action?: ProposalBlockAction;
}

export interface OpportunityBlock {
  customerId?: string;
  title?: string;
  stage?: string;
  estimatedValue?: number;
  expectedCloseDate?: string;
  createNew: boolean;
  opportunityId?: string;
  enabled: boolean;
  action?: ProposalBlockAction;
}

export interface FollowUpBlock {
  customerId?: string;
  title?: string;
  type?: string;
  dueAt?: string;
  notes?: string;
  opportunityId?: string;
  enabled: boolean;
  action?: ProposalBlockAction;
  id?: string;
}

export interface TaskBlock {
  title: string;
  dueAt: string;
  notes?: string;
  customerId?: string;
  enabled: boolean;
  action?: ProposalBlockAction;
}

export interface SignalsBlock {
  objections: string[];
  riskFlags: string[];
  buyingSignals: string[];
  enabled: boolean;
  action?: ProposalBlockAction;
}

export interface CustomerBlock {
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
  action: ProposalBlockAction;
  id?: string;
}

export interface ContactBlock {
  customerId?: string;
  fullName?: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface QuoteBlock {
  customerId: string;
  opportunityId?: string;
  validUntil?: string;
  notes?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface OrderBlock {
  customerId: string;
  opportunityId?: string;
  sourceQuoteId?: string;
  notes?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface ProductBlock {
  sku?: string;
  name?: string;
  description?: string;
  unit?: string;
  presentation?: string;
  basePrice?: number;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface SegmentBlock {
  name?: string;
  description?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface VisitBlock {
  customerId?: string;
  opportunityId?: string;
  scheduledAt?: string;
  summary?: string;
  notes?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface ProposalSummary {
  primaryCount: number;
  relatedCount: number;
  primaryActions: string[];
  relatedActions: string[];
  relatedToIds: string[];
  labels: string[];
}

export interface ProposalPayload {
  blocks: {
    interaction?: InteractionBlock;
    opportunity?: OpportunityBlock;
    followUp?: FollowUpBlock;
    task?: TaskBlock;
    signals?: SignalsBlock;
    customer?: CustomerBlock;
    contact?: ContactBlock;
    quote?: QuoteBlock;
    order?: OrderBlock;
    product?: ProductBlock;
    segment?: SegmentBlock;
    visit?: VisitBlock;
  };
  summary?: ProposalSummary;
}

export interface MentionedEntities {
  customerId?: string;
  customerName?: string;
  opportunityId?: string;
  quoteId?: string;
  orderId?: string;
  visitId?: string;
  followupId?: string;
  taskId?: string;
  productId?: string;
  segmentId?: string;
}

export interface AgendaItem {
  id: string;
  type: "visit" | "follow_up_task";
  label: string;
  scheduledAt?: string;
  priorityGroup?: number;
}

export interface ClarificationOption {
  id: string;
  label: string;
}

export interface ClarificationPayload {
  type: "customer" | "opportunity" | "product" | "date" | "action";
  options: ClarificationOption[];
}

export interface DataResult {
  entityType: string;
  action: "list" | "detail";
  data: unknown;
  summary: string;
}

export interface AgentResponse {
  mode: AgentMode;
  sessionId: string;
  message: string;
  clarification?: ClarificationPayload;
  proposal?: ProposalPayload;
  proposalId?: string;
  agenda?: { items: AgendaItem[] };
  data?: DataResult;
  confirmation?: { saved: string[]; discarded: string[]; message: string };
}
