export interface LauraClarificationOption {
  id: string;
  label: string;
}

export interface LauraProposalPayload {
  customer: {
    status: "resolved" | "ambiguous" | "missing";
    selectedOption?: LauraClarificationOption;
    options?: LauraClarificationOption[];
  };
  summary: string;
  suggestedActions: string[];
}

export interface LauraAgendaPayload {
  items: Array<{
    id: string;
    type: "visit" | "follow_up_task";
    label: string;
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
}
