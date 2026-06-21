import {
  NoraCaseRiskLevel,
  NoraConversationCaseStatus,
  NoraConversationCaseType,
} from "@prisma/client";

export type NoraCaseJsonObject = Record<string, unknown>;

export type NoraCaseAttachment = {
  messageId: string;
  kind: "image" | "document";
  provider: "kapso";
  providerMediaId?: string;
  fileName?: string;
  contentType?: string;
  caption?: string;
  payload?: Record<string, unknown>;
};

export type NoraCaseTransitionInput = {
  conversationId: string;
  type: NoraConversationCaseType;
  parentCaseId?: string | null;
  status?: NoraConversationCaseStatus;
  extractedData?: NoraCaseJsonObject;
  missingFields?: string[];
  attachments?: NoraCaseAttachment[];
  proposal?: NoraCaseJsonObject | null;
  lastQuestion?: string | null;
  riskLevel?: NoraCaseRiskLevel;
  createdByUserId?: string | null;
};

export const openNoraCaseStatuses: NoraConversationCaseStatus[] = [
  NoraConversationCaseStatus.collecting_info,
  NoraConversationCaseStatus.ready_for_review,
  NoraConversationCaseStatus.blocked,
];
