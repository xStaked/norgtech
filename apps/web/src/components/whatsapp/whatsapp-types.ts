export type WhatsAppConversationStatus = "nuevo" | "pendiente" | "en_gestion" | "resuelto";

export type WhatsAppSenderType = "cliente" | "comercial" | "admin" | "desconocido";

export type WhatsAppConversation = {
  id: string;
  phone: string;
  senderName?: string | null;
  senderType: WhatsAppSenderType;
  status: WhatsAppConversationStatus;
  lastMessageText?: string | null;
  updatedAt: string;
  customer?: { id: string; displayName: string } | null;
  contact?: { id: string; fullName: string } | null;
  assignedToUser?: { id: string; name: string } | null;
  tags?: { id: string; label: string }[];
};

export type WhatsAppMessage = {
  id: string;
  direction: "inbound" | "outbound";
  role: "user" | "assistant" | "system" | "internal";
  body: string;
  deliveryStatus?: string | null;
  createdAt: string;
};

export type WhatsAppInternalNote = {
  id: string;
  body: string;
  createdAt: string;
};

export type NoraRiskLevel = "low" | "medium" | "high";

export type NoraConversationCaseType = "order" | "new_customer" | "expense";

export type NoraConversationCaseStatus =
  | "collecting_info"
  | "ready_for_review"
  | "approved"
  | "executed"
  | "cancelled"
  | "blocked";

export type NoraOrderCaseData = {
  customerId?: string;
  customerRef?: string;
  companyId?: string;
  companyRef?: string;
  customerZoneId?: string;
  zoneRef?: string;
  deliveryInstructions?: string;
  notes?: string;
  items?: Array<{
    productRef?: string;
    product_ref?: string;
    quantity?: number;
    presentation?: string;
    notes?: string;
  }>;
};

export type NoraConversationCase = {
  id: string;
  parentCaseId?: string | null;
  type: NoraConversationCaseType;
  status: NoraConversationCaseStatus;
  extractedData: Record<string, unknown> | NoraOrderCaseData;
  missingFields: string[];
  attachments: Array<Record<string, unknown>>;
  proposal?: Record<string, unknown> | null;
  lastQuestion?: string | null;
  riskLevel: NoraRiskLevel;
  executedEntityType?: string | null;
  executedEntityId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoraProposal = {
  type: "order_draft" | "payment_support" | "logistics_event" | "expense_draft";
  title: string;
  payload: Record<string, unknown>;
  requires_human_review: boolean;
};

export type OrderAutomationResult =
  | {
      decision: "created";
      order?: { id: string; orderNumber?: string | null; status?: string | null };
      summary?: {
        company?: string | null;
        zone?: string | null;
        items?: Array<{ name: string; sku?: string; quantity: number; unit?: string }>;
        total?: number;
      };
      reply?: string;
    }
  | {
      decision: "needs_clarification";
      missingField?: string;
      question: string;
    }
  | {
      decision: "human_review";
      reason: string;
      proposal?: NoraProposal;
      existingOrder?: { id: string; orderNumber?: string | null; status?: string | null };
    };

export type NoraActionOutput = {
  mode?: string;
  intent?: string;
  summary?: string;
  suggested_reply?: string;
  requires_human_review?: boolean;
  risk_level?: NoraRiskLevel;
  missing_fields?: string[];
  blocked_reason?: string | null;
  proposals?: NoraProposal[];
  proposed_order?: Record<string, unknown>;
  order_automation?: OrderAutomationResult;
  order_candidate?: Record<string, unknown>;
};

export type NoraActionLog = {
  id: string;
  mode: string;
  action: string;
  status: "proposed" | "confirmed" | "executed" | "discarded" | "failed";
  input: Record<string, unknown>;
  output?: NoraActionOutput | null;
  error?: string | null;
  createdAt: string;
};

export type WhatsAppOrder = {
  id: string;
  orderNumber?: string | null;
  status: string;
  total?: string | number | null;
};

export type WhatsAppConversationDetail = WhatsAppConversation & {
  messages: WhatsAppMessage[];
  notes: WhatsAppInternalNote[];
  noraActions: NoraActionLog[];
  noraCases: NoraConversationCase[];
  orders: WhatsAppOrder[];
};
