import type { ProposalPayload } from "./types.js";
import {
  createInteraction,
  createFollowUp,
  createTask,
  upsertOpportunity,
} from "./tools/nestjs-client.js";

export interface ConfirmResult {
  saved: string[];
  discarded: string[];
  createdIds: Record<string, string>;
  message: string;
}

export async function handleConfirm(
  proposal: ProposalPayload,
  customerId: string | undefined,
  opportunityId: string | undefined,
): Promise<ConfirmResult> {
  const blocks = proposal.blocks;
  const saved: string[] = [];
  const discarded: string[] = [];
  const createdIds: Record<string, string> = {};
  const custId = customerId ?? "";

  let oppId = blocks.opportunity?.opportunityId
    ?? opportunityId;

  if (blocks.opportunity?.enabled && custId) {
    if (blocks.opportunity.createNew) {
      const created = await upsertOpportunity({
        customerId: custId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage ?? "contacto",
      });
      oppId = created.id;
      saved.push("opportunity");
      createdIds.opportunity = created.id;
    } else if (blocks.opportunity.opportunityId && blocks.opportunity.stage) {
      const updated = await upsertOpportunity({
        customerId: custId,
        title: blocks.opportunity.title ?? "Seguimiento comercial",
        stage: blocks.opportunity.stage,
        opportunityId: blocks.opportunity.opportunityId,
      });
      oppId = updated.id;
      saved.push("opportunity");
      createdIds.opportunity = updated.id;
    } else {
      discarded.push("opportunity");
    }
  }

  if (blocks.interaction?.enabled && custId) {
    const interaction = await createInteraction({
      customerId: custId,
      summary: blocks.interaction.summary,
      rawMessage: blocks.interaction.rawMessage,
      opportunityId: oppId,
    });
    saved.push("interaction");
    createdIds.interaction = interaction.id;
  }

  if (blocks.followUp?.enabled && custId) {
    const task = await createFollowUp({
      customerId: custId,
      title: blocks.followUp.title,
      dueAt: blocks.followUp.dueAt,
      type: blocks.followUp.type,
      opportunityId: oppId,
    });
    saved.push("followUp");
    createdIds.followUp = task.id;
  }

  if (blocks.task?.enabled && custId) {
    const task = await createTask({
      customerId: custId,
      title: blocks.task.title,
      dueAt: blocks.task.dueAt,
      opportunityId: oppId,
      notes: blocks.task.notes,
    });
    saved.push("task");
    createdIds.task = task.id;
  }

  const message = `Laura guardó ${saved.length} bloques${discarded.length > 0 ? ` y descartó ${discarded.length}` : ""}.`;

  return { saved, discarded, createdIds, message };
}