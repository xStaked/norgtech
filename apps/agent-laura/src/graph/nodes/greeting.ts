import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";

export async function greetingNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const message = "¡Hola! 👋 Soy Laura, tu asistente comercial. Contame qué pasó en tu visita, qué pendientes tenés o si querés ver tu agenda.";

  return {
    mode: "greeting",
    messages: [...state.messages, new AIMessage(message)],
  };
}