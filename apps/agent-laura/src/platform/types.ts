export type CapabilityDomain =
  | "customers"
  | "contacts"
  | "opportunities"
  | "visits"
  | "followups"
  | "quotes"
  | "orders"
  | "products"
  | "segments"
  | "reports"
  | "dashboard";

export type CapabilityAction =
  | "search"
  | "detail"
  | "create"
  | "update"
  | "cancel"
  | "complete"
  | "change_status"
  | "add_item"
  | "bulk_delete";

export type CapabilityKind = "read" | "write";

export interface PlatformCapability {
  domain: CapabilityDomain;
  action: CapabilityAction;
  kind: CapabilityKind;
  toolName: string;
  description: string;
  requiredFields?: string[];
  optionalFields?: string[];
  requiresConfirmation?: boolean;
}

export interface PlatformContext {
  userId: string;
  sessionId: string;
  locale?: string;
  timezone?: string;
  now?: string;
  mentionedEntities?: Record<string, string | undefined>;
}

export interface PlannedAction {
  domain: CapabilityDomain;
  action: CapabilityAction;
  toolName: string;
  arguments: Record<string, unknown>;
  requiredFields: string[];
  missingFields: string[];
  requiresConfirmation: boolean;
  confidence?: number;
  entityRef?: string;
  humanSummary?: string;
  relatedTo?: string;
  role?: "primary" | "related";
}

export interface PlatformPlan {
  intent: string;
  summary: string;
  actions: PlannedAction[];
  requiresConfirmation: boolean;
  clarificationQuestion?: string;
  missingFields?: string[];
  ambiguity?: string[];
  confidence?: number;
  responseStyle?: "brief" | "adaptive";
}

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  errors: string[];
  warnings: string[];
}
