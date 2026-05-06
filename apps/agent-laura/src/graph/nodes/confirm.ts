import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import {
  createInteraction,
  createFollowUp,
  createTask,
  upsertOpportunity,
} from "../../tools/nestjs-client.js";

export async function confirmNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  if (!state.proposal) {
    return {
      mode: "proposal",
      lastError: "No hay propuesta para confirmar",
      messages: [...state.messages, new AIMessage("No hay propuesta para confirmar.")],
    };
  }

  const blocks = state.proposal.blocks;
  const customerId = state.customerContext?.id;
  const saved: string[] = [];
  const discarded: string[] = [];

  let opportunityId = blocks.opportunity?.opportunityId
    ?? state.opportunityContext?.id;

  if (blocks.opportunity?.enabled && customerId) {
    if (blocks.opportunity.createNew) {
      const created = await upsertOpportunity({
        customerId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage ?? "contacto",
      });
      opportunityId = created.id;
      saved.push("opportunity");
    } else if (blocks.opportunity.opportunityId && blocks.opportunity.stage) {
      const updated = await upsertOpportunity({
        customerId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage,
        opportunityId: blocks.opportunity.opportunityId,
      });
      opportunityId = updated.id;
      saved.push("opportunity");
    } else {
      discarded.push("opportunity");
    }
  }

  if (blocks.interaction?.enabled && customerId) {
    await createInteraction({
      customerId,
      summary: blocks.interaction.summary,
      rawMessage: blocks.interaction.rawMessage,
      opportunityId,
    });
    saved.push("interaction");
  }

  if (blocks.followUp?.enabled && customerId) {
    await createFollowUp({
      customerId,
      title: blocks.followUp.title,
      dueAt: blocks.followUp.dueAt,
      type: blocks.followUp.type,
      opportunityId,
    });
    saved.push("followUp");
  }

  if (blocks.task?.enabled && customerId) {
    await createTask({
      customerId,
      title: blocks.task.title,
      dueAt: blocks.task.dueAt,
      opportunityId: opportunityId,
      notes: blocks.task.notes,
    });
    saved.push("task");
  }

  const summary = `Laura guardó ${saved.length} bloques${discarded.length > 0 ? ` y descartó ${discarded.length}` : ""}.`;

  return {
    proposalStatus: "confirmed",
    messages: [...state.messages, new AIMessage(summary)],
  };
}