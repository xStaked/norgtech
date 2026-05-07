import type { LauraState } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { createLlm } from "../../config/providers.js";
import type { ProposalPayload } from "../../types.js";

const REFINE_PROMPT = `El usuario quiere ajustar la propuesta comercial actual. Analizá su feedback y generá una versión mejorada de los campos que menciona.

Propuesta actual:
{CURRENT_PROPOSAL}

Feedback del usuario:
{USER_FEEDBACK}

Respondé SOLO con un JSON que contenga los campos que hay que actualizar, manteniendo los demás igual. Si el usuario no sugiere cambios específicos, devolvé la propuesta sin modificaciones.`;

const PROPOSAL_BLOCK_KEYS: Array<keyof ProposalPayload["blocks"]> = [
  "interaction",
  "opportunity",
  "followUp",
  "task",
  "signals",
  "customer",
  "contact",
  "quote",
  "order",
  "product",
  "segment",
  "visit",
];

function normalizeBlockUpdates(updates: Record<string, unknown>): Partial<ProposalPayload["blocks"]> {
  if (updates.blocks && typeof updates.blocks === "object" && !Array.isArray(updates.blocks)) {
    return updates.blocks as Partial<ProposalPayload["blocks"]>;
  }

  const directUpdates: Partial<ProposalPayload["blocks"]> = {};
  for (const key of PROPOSAL_BLOCK_KEYS) {
    const value = updates[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      directUpdates[key] = value as ProposalPayload["blocks"][typeof key];
    }
  }
  return directUpdates;
}

function mergeBlocks(
  current: ProposalPayload["blocks"],
  updates: Partial<ProposalPayload["blocks"]>,
): ProposalPayload["blocks"] {
  const merged: ProposalPayload["blocks"] = { ...current };

  for (const key of PROPOSAL_BLOCK_KEYS) {
    const update = updates[key];
    if (!update) continue;

    const existing = merged[key];
    if (existing && typeof existing === "object") {
      merged[key] = { ...existing, ...update } as ProposalPayload["blocks"][typeof key];
    } else {
      merged[key] = update as ProposalPayload["blocks"][typeof key];
    }
  }

  return merged;
}

export async function refineNode(state: LauraState): Promise<Partial<LauraState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const feedback = typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content);

  if (!state.proposal) {
    return {
      mode: "proposal",
      lastError: "No hay propuesta activa para refinar",
    };
  }

  const prompt = REFINE_PROMPT
    .replace("{CURRENT_PROPOSAL}", JSON.stringify(state.proposal, null, 2))
    .replace("{USER_FEEDBACK}", feedback);

  const llm = createLlm();
  const response = await llm.invoke([{ role: "user", content: prompt }]);

  try {
    const cleaned = response.content.toString()
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?\s*```$/, "")
      .trim();
    const updates = JSON.parse(cleaned) as Record<string, unknown>;
    const blockUpdates = normalizeBlockUpdates(updates);
    const hasBlockUpdates = Object.keys(blockUpdates).length > 0;

    if (!hasBlockUpdates) {
      return {
        proposal: state.proposal,
        proposalStatus: "draft",
        messages: [...state.messages, new AIMessage("No pude aplicar cambios concretos con ese feedback. ¿Podés especificar qué campo querés ajustar?")],
      };
    }

    const refinedProposal = {
      ...state.proposal,
      blocks: mergeBlocks(state.proposal.blocks, blockUpdates),
    };

    return {
      proposal: refinedProposal,
      proposalStatus: "draft",
      messages: [...state.messages, new AIMessage("Ajusté la propuesta según tu feedback. Revisala.")],
    };
  } catch {
    return {
      proposal: state.proposal,
      proposalStatus: "draft",
      messages: [...state.messages, new AIMessage("No pude entender los cambios. ¿Podés describirlos de otra forma?")],
    };
  }
}
