import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";

export async function discardNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  return {
    proposalStatus: "discarded",
    proposal: null,
    proposalId: null,
    messages: [...state.messages, new AIMessage("Propuesta descartada. ¿Hay algo más en lo que pueda ayudarte?")],
  };
}