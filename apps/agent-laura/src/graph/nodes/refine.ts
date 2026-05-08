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
      (directUpdates as Record<string, unknown>)[key] = value;
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
      (merged as Record<string, unknown>)[key] = { ...existing, ...update };
    } else {
      (merged as Record<string, unknown>)[key] = update;
    }
  }

  return merged;
}

function extractEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractPhone(text: string): string | undefined {
  const withoutEmail = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ");
  const phoneCandidate = withoutEmail.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0];
  if (!phoneCandidate) return undefined;

  const normalized = phoneCandidate.replace(/[^\d+]/g, "");
  return normalized.replace(/^\+/, "").length >= 7 ? normalized : undefined;
}

function extractCustomerName(text: string): string | undefined {
  const normalizedText = text.trim();
  const patterns = [
    /(?:se\s+llama|el\s+nombre\s+es|nombre\s*:)\s*([^,.;\n]+)/i,
    /(?:cliente|empresa|compania|compañia|compañía)\s+(?:se\s+llama\s+)?([^,.;\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    const rawName = match?.[1]?.trim();
    if (!rawName) continue;

    const cleanedName = rawName
      .replace(/\s+/g, " ")
      .replace(/^(es|seria|sería)\s+/i, "")
      .trim();

    if (cleanedName.length > 0) {
      return cleanedName;
    }
  }

  return undefined;
}

function isDataAcknowledgement(feedback: string): boolean {
  const normalized = feedback
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  const patterns = [
    "ya te pase los datos",
    "ya te pase los info",
    "ya te di los datos",
    "ya te mande los datos",
    "ya te comparti los datos",
    "ya los pase",
    "ya pase los datos",
  ];

  return patterns.some((pattern) => normalized.includes(pattern));
}

function directCustomerContactUpdate(
  proposal: ProposalPayload,
  feedback: string,
): ProposalPayload | null {
  if (!proposal.blocks.customer) return null;

  const customerName = extractCustomerName(feedback);
  const email = extractEmail(feedback);
  const phone = extractPhone(feedback);
  if (!customerName && !email && !phone) return null;

  return {
    ...proposal,
    blocks: {
      ...proposal.blocks,
      customer: {
        ...proposal.blocks.customer,
        ...(customerName ? { legalName: customerName, displayName: customerName } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      },
    },
  };
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

  const directUpdate = directCustomerContactUpdate(state.proposal, feedback);
  if (directUpdate) {
    return {
      proposal: directUpdate,
      proposalStatus: "draft",
      messages: [...state.messages, new AIMessage("Ajusté la propuesta según tu feedback. Revisala.")],
    };
  }

  if (isDataAcknowledgement(feedback)) {
    return {
      proposal: state.proposal,
      proposalStatus: "draft",
      messages: [...state.messages, new AIMessage("Ya tomé esos datos en la propuesta. Si querés, la confirmamos.")],
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
