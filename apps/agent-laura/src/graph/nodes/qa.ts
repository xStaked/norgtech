import type { LauraState } from "../state.js";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { createLlm } from "../../config/providers.js";
import { searchCustomers } from "../../tools/nestjs-client.js";
import { searchOpportunities } from "../../tools/nestjs-client.js";
import { getCustomerDetails } from "../../tools/nestjs-client.js";
import { getOpportunityDetails } from "../../tools/nestjs-client.js";
import { getPendingTasks } from "../../tools/nestjs-client.js";
import { getScheduledVisits } from "../../tools/nestjs-client.js";
import { searchCustomersTool } from "../../tools/search-customers.js";
import { searchOpportunitiesTool } from "../../tools/search-opportunities.js";
import { getCustomerDetailsTool } from "../../tools/get-customer-details.js";
import { getOpportunityDetailsTool } from "../../tools/get-opportunity-details.js";
import { getPendingTasksTool } from "../../tools/get-pending-tasks.js";
import { getScheduledVisitsTool } from "../../tools/get-scheduled-visits.js";
import type { ToolCall } from "@langchain/core/messages/tool";

const QA_SYSTEM_PROMPT = `Eres Laura, asistente comercial del CRM Norgtech. Respondé la pregunta del usuario usando los datos disponibles a través de las herramientas.

Reglas:
1. Usá las herramientas para obtener datos reales antes de responder. Nunca respondas de memoria.
2. Respondé de forma específica y concisa. No repitas toda la información si solo preguntaron por un detalle.
3. Si no encontrás datos, decilo honestamente: "No encontré información sobre eso."
4. Nunca inventes información.
5. Prestá atención al contexto de la conversación. Si el usuario dice "él", "ella", "ese cliente", "esa reunión", etc., resolvé la referencia usando lo que se mencionó antes.
6. Respondé en español rioplatense, de forma breve y directa.`;

const qaTools = [
  searchCustomersTool,
  searchOpportunitiesTool,
  getCustomerDetailsTool,
  getOpportunityDetailsTool,
  getPendingTasksTool,
  getScheduledVisitsTool,
];

async function executeToolCall(toolCall: ToolCall, userId: string): Promise<string> {
  const args = toolCall.args as Record<string, unknown>;

  switch (toolCall.name) {
    case "search_customers": {
      const result = await searchCustomers((args.query as string) ?? "");
      return JSON.stringify(result);
    }
    case "search_opportunities": {
      const result = await searchOpportunities((args.query as string) ?? "");
      return JSON.stringify(result);
    }
    case "get_customer_details": {
      const result = await getCustomerDetails((args.customerId as string) ?? "");
      return JSON.stringify(result);
    }
    case "get_opportunity_details": {
      const result = await getOpportunityDetails((args.opportunityId as string) ?? "");
      return JSON.stringify(result);
    }
    case "get_pending_tasks": {
      const result = await getPendingTasks(userId);
      return JSON.stringify(result);
    }
    case "get_scheduled_visits": {
      const result = await getScheduledVisits(userId);
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
  }
}

const MAX_TOOL_ITERATIONS = 5;

function buildConversationContext(state: LauraState): string {
  const parts: string[] = [];

  if (state.agendaItems && state.agendaItems.length > 0) {
    parts.push("Agenda actual del usuario:");
    for (const item of state.agendaItems) {
      const time = item.scheduledAt ? ` - ${new Date(item.scheduledAt).toLocaleString("es-AR")}` : "";
      parts.push(`  - [${item.type}] ${item.label}${time}`);
    }
  }

  if (state.customerContext) {
    parts.push(`Cliente en contexto: ${state.customerContext.label} (ID: ${state.customerContext.id})`);
  }

  if (state.opportunityContext) {
    parts.push(`Oportunidad en contexto: ${state.opportunityContext.label} (ID: ${state.opportunityContext.id})`);
  }

  return parts.length > 0 ? parts.join("\n") : "";
}

export async function qaNode(state: LauraState): Promise<Partial<LauraState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const userContent = typeof lastMessage.content === "string"
    ? lastMessage.content
    : String(lastMessage.content);

  const llm = createLlm().bindTools(qaTools);

  try {
    const messages: BaseMessage[] = [new SystemMessage(QA_SYSTEM_PROMPT)];

    const contextBlock = buildConversationContext(state);
    if (contextBlock) {
      messages.push(new HumanMessage(`[Contexto del sistema]\n${contextBlock}`));
      messages.push(new AIMessage("Entendido, tengo ese contexto en cuenta."));
    }

    const previousMessages = state.messages.slice(-10);
    for (const m of previousMessages) {
      messages.push(m);
    }

    if (messages[messages.length - 1] !== lastMessage) {
      messages.push(new HumanMessage(userContent));
    }

    let finalAnswer = "";

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await llm.invoke(messages);

      const toolCalls = (response as unknown as { tool_calls?: ToolCall[] }).tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        if (typeof response.content === "string") {
          finalAnswer = response.content;
        } else if (Array.isArray(response.content)) {
          const textParts = (response.content as Array<unknown>).filter(
            (part): part is { type: "text"; text: string } =>
              typeof part === "object" && part !== null && "type" in part && (part as { type: string }).type === "text",
          );
          finalAnswer = textParts.map((p) => p.text).join("\n");
        }
        break;
      }

      messages.push(response);

      for (const toolCall of toolCalls) {
        try {
          const result = await executeToolCall(toolCall, state.userId);
          messages.push(new ToolMessage(result, toolCall.id ?? ""));
        } catch (toolError) {
          const errMsg = toolError instanceof Error ? toolError.message : "Tool execution failed";
          messages.push(new ToolMessage(JSON.stringify({ error: errMsg }), toolCall.id ?? ""));
        }
      }
    }

    if (!finalAnswer) {
      finalAnswer = "No pude obtener esa información en este momento. ¿Podés reformular la pregunta?";
    }

    return {
      mode: "qa",
      messages: [...state.messages, new AIMessage(finalAnswer)],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("QA node error:", errorMessage);
    return {
      mode: "qa",
      messages: [
        ...state.messages,
        new AIMessage("No pude obtener esa información en este momento. ¿Podés reformular la pregunta?"),
      ],
    };
  }
}