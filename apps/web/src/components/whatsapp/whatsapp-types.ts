export type WhatsAppConversationStatus = "nuevo" | "abierto" | "pendiente" | "cerrado";

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

export type NoraActionLog = {
  id: string;
  mode: string;
  action: string;
  status: "proposed" | "confirmed" | "executed" | "discarded" | "failed";
  input: Record<string, unknown>;
  output?: {
    mode?: string;
    intent?: string;
    summary?: string;
    suggested_reply?: string;
    requires_human_review?: boolean;
    proposed_order?: Record<string, unknown>;
  } | null;
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
  orders: WhatsAppOrder[];
};
