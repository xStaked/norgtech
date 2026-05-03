import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { createLlm } from "../../config/providers.js";

const REFINE_PROMPT = `El usuario quiere ajustar la propuesta comercial actual. Analizá su feedback y generá una versión mejorada de los campos que menciona.

Propuesta actual:
{CURRENT_PROPOSAL}

Feedback del usuario:
{USER_FEEDBACK}

Respondé SOLO con un JSON que contenga los campos que hay que actualizar, manteniendo los demás igual. Si el usuario no sugiere cambios específicos, devolvé la propuesta sin modificaciones.`;

export async function refineNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
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

    const refinedProposal = {
      ...state.proposal,
      blocks: { ...state.proposal.blocks, ...(updates.blocks as typeof state.proposal.blocks) },
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