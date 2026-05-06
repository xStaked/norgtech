import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import type { ProposalPayload } from "../../types.js";

export async function buildProposalNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const extraction = state._extractionResult;
  const lastUserContent = state.messages
    .filter((m) => m._getType() === "human")
    .pop()?.content;
  const content = typeof lastUserContent === "string" ? lastUserContent : String(lastUserContent ?? "");

  const canPersist = Boolean(state.customerContext?.id);

  const sig = extraction?.signals as Record<string, unknown> | undefined;

  const proposal: ProposalPayload = {
    blocks: {
      interaction: {
        enabled: canPersist,
        summary: (extraction?.interactionSummary as string) ?? content.trim(),
        rawMessage: content.trim(),
      },
      opportunity: {
        enabled: canPersist,
        opportunityId: state.opportunityContext?.id,
        createNew: !state.opportunityContext?.id && canPersist,
        title: (extraction?.suggestedOpportunityTitle as string) ?? "Seguimiento comercial",
        stage: (extraction?.suggestedOpportunityStage as string) ?? "contacto",
      },
      followUp: {
        enabled: canPersist,
        title: (extraction?.suggestedNextStep as string) ?? "Dar seguimiento comercial",
        dueAt: (extraction?.suggestedFollowUpDate as string) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        type: (extraction?.taskType as string) ?? "llamada",
      },
      task: {
        enabled: canPersist,
        title: (extraction?.suggestedTaskTitle as string) ?? "Registrar seguimiento comercial",
        dueAt: (extraction?.suggestedFollowUpDate as string) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: extraction?.contactName as string | undefined,
      },
      signals: {
        enabled: canPersist,
        objections: (sig?.objections as string[]) ?? [],
        riskFlags: sig?.risk ? [sig.risk as string] : [],
        buyingSignals: sig?.buyingIntent ? [sig.buyingIntent as string] : [],
      },
    },
  };

  const proposalId = state.proposalId ?? crypto.randomUUID();

  return {
    mode: "proposal",
    proposal,
    proposalId,
    proposalStatus: "draft",
    messages: [
      ...state.messages,
      new AIMessage("Preparé una propuesta inicial para que la revises antes de guardarla."),
    ],
  };
}