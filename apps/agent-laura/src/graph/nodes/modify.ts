import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LauraState } from "../state.js";
import { createLlm } from "../../config/providers.js";
import { LAURA_SYSTEM_PROMPT } from "../../prompts/system-prompt.js";
import { SYSTEM_MODIFY_SECTION } from "../../prompts/prompt-sections.js";
import type { ProposalPayload } from "../../types.js";
import { randomUUID } from "crypto";

export async function modifyNode(state: LauraState): Promise<Partial<LauraState>> {
  const llm = createLlm();

  const lastUserMessage = state.messages
    .filter((m) => m.getType() === "human")
    .pop();
  const content = typeof lastUserMessage?.content === "string"
    ? lastUserMessage.content
    : "";

  const contextLines: string[] = [];
  if (state.customerContext) {
    contextLines.push(`Cliente: ${state.customerContext.label} (ID: ${state.customerContext.id})`);
  }
  if (state.opportunityContext) {
    contextLines.push(`Oportunidad: ${state.opportunityContext.label} (ID: ${state.opportunityContext.id})`);
  }
  if (state.mentionedEntities && Object.keys(state.mentionedEntities).length > 0) {
    for (const [key, value] of Object.entries(state.mentionedEntities)) {
      if (value) contextLines.push(`${key}: ${value}`);
    }
  }
  if (state.proposal) {
    contextLines.push(`Propuesta activa: ${JSON.stringify(state.proposal)}`);
  }
  if (state.agendaItems && state.agendaItems.length > 0) {
    contextLines.push(`Agenda: ${JSON.stringify(state.agendaItems.slice(0, 5))}`);
  }

  const systemContent = `${LAURA_SYSTEM_PROMPT}\n\n${SYSTEM_MODIFY_SECTION}\n\nContexto de la conversacion:\n${contextLines.join("\n")}`;

  const response = await llm.invoke([
    new SystemMessage(systemContent),
    new HumanMessage(content),
  ]);

  let parsed: Record<string, unknown> = {};
  try {
    const rawContent = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch {
    parsed = { entityType: "followup", action: "update", data: {} };
  }

  const entityType = (parsed.entityType as string) ?? "followup";
  const action = (parsed.action as "create" | "update" | "delete") ?? "update";
  const data = (parsed.data as Record<string, unknown>) ?? {};

  const blocks: ProposalPayload["blocks"] = {};
  const now = new Date().toISOString();

  switch (entityType) {
    case "followup": {
      blocks.followUp = {
        title: (data.title as string) ?? "Seguimiento",
        type: (data.type as string) ?? "llamada",
        dueAt: (data.dueAt as string) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: data.notes as string | undefined,
        enabled: true,
        action,
        id: (data.id as string) ?? state.mentionedEntities?.followupId,
      };
      break;
    }
    case "visit": {
      blocks.visit = {
        customerId: (data.customerId as string) ?? state.customerContext?.id ?? "",
        scheduledAt: (data.scheduledAt as string) ?? now,
        summary: data.summary as string | undefined,
        notes: data.notes as string | undefined,
        enabled: true,
        action,
        id: (data.id as string) ?? state.mentionedEntities?.visitId,
      };
      break;
    }
    case "opportunity": {
      blocks.opportunity = {
        title: (data.title as string) ?? "Oportunidad",
        stage: (data.stage as string) ?? "prospecto",
        estimatedValue: data.estimatedValue as number | undefined,
        createNew: !data.id,
        opportunityId: (data.id as string) ?? state.opportunityContext?.id,
        enabled: true,
        action,
      };
      break;
    }
    case "customer": {
      blocks.customer = {
        legalName: (data.legalName as string) ?? "",
        displayName: data.displayName as string | undefined,
        phone: data.phone as string | undefined,
        email: data.email as string | undefined,
        address: data.address as string | undefined,
        notes: data.notes as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "contact": {
      blocks.contact = {
        fullName: (data.fullName as string) ?? "",
        customerId: (data.customerId as string) ?? state.customerContext?.id ?? "",
        phone: data.phone as string | undefined,
        email: data.email as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "quote": {
      blocks.quote = {
        customerId: (data.customerId as string) ?? state.customerContext?.id ?? "",
        items: data.items as Array<{ productId: string; quantity: number; unitPrice: number }> | undefined,
        notes: data.notes as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "order": {
      blocks.order = {
        customerId: (data.customerId as string) ?? state.customerContext?.id ?? "",
        sourceQuoteId: data.sourceQuoteId as string | undefined,
        items: data.items as Array<{ productId: string; quantity: number; unitPrice: number }> | undefined,
        notes: data.notes as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "product": {
      blocks.product = {
        sku: (data.sku as string) ?? "",
        name: (data.name as string) ?? "",
        description: data.description as string | undefined,
        basePrice: data.basePrice as number | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "segment": {
      blocks.segment = {
        name: (data.name as string) ?? "",
        description: data.description as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    default: {
      blocks.interaction = {
        summary: (parsed.interactionSummary as string) ?? content,
        rawMessage: content,
        enabled: true,
        action: "create",
      };
    }
  }

  const proposalPayload: ProposalPayload = { blocks };
  const proposalId = state.proposalId ?? randomUUID();

  const updatedMentionedEntities = { ...state.mentionedEntities };
  if (entityType === "followup" && blocks.followUp?.id) {
    updatedMentionedEntities.followupId = blocks.followUp.id;
  } else if (entityType === "visit" && blocks.visit?.id) {
    updatedMentionedEntities.visitId = blocks.visit.id;
  } else if (entityType === "opportunity" && blocks.opportunity?.opportunityId) {
    updatedMentionedEntities.opportunityId = blocks.opportunity.opportunityId;
  }

  return {
    mode: "proposal" as const,
    proposal: proposalPayload,
    proposalId,
    proposalStatus: "draft" as const,
    mentionedEntities: updatedMentionedEntities,
  };
}
