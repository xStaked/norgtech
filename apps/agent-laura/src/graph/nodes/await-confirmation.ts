import type { LauraStateType } from "../state.js";
import { interrupt } from "@langchain/langgraph";

export async function awaitConfirmationNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  interrupt("Awaiting user confirmation for proposal");

  return {};
}