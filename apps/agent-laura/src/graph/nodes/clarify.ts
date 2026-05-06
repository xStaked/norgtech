import type { LauraState } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { searchCustomers } from "../../tools/nestjs-client.js";

export async function clarifyNode(state: LauraState): Promise<Partial<LauraState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content);

  const results = await searchCustomers(content);
  const options = results.map((r) => ({ id: r.id, label: r.label }));

  if (options.length === 0) {
    return {
      mode: "proposal",
      messages: [...state.messages, new AIMessage("No encontré clientes que coincidan. ¿Podés darme más detalles?")],
      clarificationOptions: null,
    };
  }

  if (options.length === 1) {
    return {
      mode: "proposal",
      customerContext: { id: options[0].id, label: options[0].label },
      clarificationOptions: null,
      messages: state.messages,
    };
  }

  const optionsList = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  const message = `Encontré varios clientes que coinciden:\n${optionsList}\n¿Cuál es?`;

  return {
    mode: "clarification",
    clarificationOptions: { type: "customer", options },
    messages: [...state.messages, new AIMessage(message)],
  };
}