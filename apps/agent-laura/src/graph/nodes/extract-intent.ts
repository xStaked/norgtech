import type { LauraState } from "../state.js";
import { createLlm } from "../../config/providers.js";
import { LAURA_SYSTEM_PROMPT } from "../../prompts/system-prompt.js";
import { SYSTEM_SCHEMA } from "../../prompts/prompt-sections.js";

interface ExtractionResult {
  intent: "report" | "agenda_query";
  customerName?: string;
  contactName?: string;
  interactionSummary?: string;
  suggestedOpportunityTitle?: string;
  suggestedOpportunityStage?: string;
  suggestedNextStep?: string;
  suggestedFollowUpDate?: string;
  suggestedTaskTitle?: string;
  taskType?: string;
  signals?: {
    objections?: string[];
    risk?: string;
    buyingIntent?: string;
  };
}

export async function extractIntentNode(state: LauraState): Promise<Partial<LauraState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const content = typeof lastMessage.content === "string" ? lastMessage.content : String(lastMessage.content);

  const recentMessages = state.messages
    .slice(-6)
    .map((m) => typeof m.content === "string" ? m.content : String(m.content));

  const llm = createLlm();
  const systemPrompt = `${LAURA_SYSTEM_PROMPT}\n\n${SYSTEM_SCHEMA}\n\nContexto del cliente:\n${state.customerContext?.label ?? "Sin contexto de cliente adicional."}\n\nMensajes anteriores en esta sesión:\n${recentMessages.join("\n") || "Sin mensajes previos en esta sesión."}`;

  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content },
  ]);

  let extraction: ExtractionResult;
  try {
    const cleaned = response.content.toString()
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?\s*```$/, "")
      .trim();
    extraction = JSON.parse(cleaned) as ExtractionResult;
  } catch {
    extraction = {
      intent: "report",
      interactionSummary: content.trim(),
    };
  }

  if (extraction.intent === "agenda_query") {
    return { mode: "agenda" };
  }

  return {
    mode: "proposal",
    messages: state.messages,
    _extractionResult: extraction as unknown as Record<string, unknown>,
  };
}