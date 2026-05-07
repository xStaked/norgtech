import type { LauraState } from "../state.js";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { createLlm } from "../../config/providers.js";
import { searchCustomers } from "../../tools/nestjs-client.js";
import { searchOpportunities } from "../../tools/nestjs-client.js";
import { getCustomerDetails } from "../../tools/nestjs-client.js";
import { getOpportunityDetails } from "../../tools/nestjs-client.js";
import { getPendingTasks } from "../../tools/nestjs-client.js";
import { getScheduledVisits } from "../../tools/nestjs-client.js";
import { searchProducts } from "../../tools/nestjs-client.js";
import { getProductDetails } from "../../tools/nestjs-client.js";
import { searchQuotes } from "../../tools/nestjs-client.js";
import { searchOrders } from "../../tools/nestjs-client.js";
import { searchSegments } from "../../tools/nestjs-client.js";
import { searchContacts } from "../../tools/nestjs-client.js";
import { getDashboardSummary } from "../../tools/nestjs-client.js";
import { searchCustomersTool } from "../../tools/search-customers.js";
import { searchOpportunitiesTool } from "../../tools/search-opportunities.js";
import { getCustomerDetailsTool } from "../../tools/get-customer-details.js";
import { getOpportunityDetailsTool } from "../../tools/get-opportunity-details.js";
import { getPendingTasksTool } from "../../tools/get-pending-tasks.js";
import { getScheduledVisitsTool } from "../../tools/get-scheduled-visits.js";
import { searchProductsTool } from "../../tools/search-products.js";
import { getProductDetailsTool } from "../../tools/get-product-details.js";
import { searchQuotesTool } from "../../tools/search-quotes.js";
import { searchOrdersTool } from "../../tools/search-orders.js";
import { searchSegmentsTool } from "../../tools/search-segments.js";
import { searchContactsTool } from "../../tools/search-contacts.js";
import { getDashboardSummaryTool } from "../../tools/get-dashboard-summary.js";
import type { ToolCall } from "@langchain/core/messages/tool";

const QA_SYSTEM_PROMPT = `Eres Laura, la asistente comercial del CRM Norgtech. Podés hacer MUCHAS cosas para ayudar a los vendedores:

Tus capacidades son:

📋 **Consultas (respondés directo):**
- Ver agenda del día: tareas pendientes y visitas programadas
- Buscar clientes, oportunidades, productos, cotizaciones, pedidos, segmentos, contactos
- Ver detalles de cualquier entidad (cliente, producto, cotización, pedido, etc.)
- Dashboard con KPIs: total de clientes, oportunidades activas, cotizaciones pendientes, pedidos abiertos
- Listar productos del catálogo, cotizaciones por estado, pedidos por cliente

✏️ **Creación (generás propuesta que el usuario confirma):**
- Registrar nuevos clientes, contactos, oportunidades
- Crear cotizaciones con items y precios
- Crear pedidos desde cotizaciones
- Registrar visitas, seguimientos y tareas
- Dar de alta productos y segmentos

🔧 **Modificación (generás propuesta que el usuario confirma):**
- Cambiar fecha/hora de tareas, visitas y seguimientos
- Actualizar estado de oportunidades, cotizaciones, pedidos
- Editar datos de clientes, contactos, productos
- Reprogramar o cancelar visitas
- Completar seguimientos

Reglas:
1. Si te preguntan qué podés hacer, describí tus capacidades como lo hago arriba.
2. Usá las herramientas para obtener datos reales antes de responder. Nunca respondas de memoria.
3. Respondé de forma específica y concisa.
4. Si no encontrás datos, decilo honestamente: "No encontré información sobre eso."
5. Nunca inventes información.
6. Respondé en español rioplatense, de forma breve y directa.
7. Usá "vos" en lugar de "tú".`;

const qaTools = [
  searchCustomersTool,
  searchOpportunitiesTool,
  getCustomerDetailsTool,
  getOpportunityDetailsTool,
  getPendingTasksTool,
  getScheduledVisitsTool,
  searchProductsTool,
  getProductDetailsTool,
  searchQuotesTool,
  searchOrdersTool,
  searchSegmentsTool,
  searchContactsTool,
  getDashboardSummaryTool,
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
    case "search_products": {
      const result = await searchProducts({ search: (args.search as string) ?? undefined, active: (args.active as boolean) ?? true });
      return JSON.stringify(result);
    }
    case "get_product_details": {
      const result = await getProductDetails((args.productId as string) ?? "");
      return JSON.stringify(result);
    }
    case "search_quotes": {
      const result = await searchQuotes({
        customerId: (args.customerId as string) ?? undefined,
        status: (args.status as string) ?? undefined,
        search: (args.search as string) ?? undefined,
      });
      return JSON.stringify(result);
    }
    case "search_orders": {
      const result = await searchOrders({
        customerId: (args.customerId as string) ?? undefined,
        status: (args.status as string) ?? undefined,
        search: (args.search as string) ?? undefined,
      });
      return JSON.stringify(result);
    }
    case "search_segments": {
      const result = await searchSegments();
      return JSON.stringify(result);
    }
    case "search_contacts": {
      const result = await searchContacts({
        search: (args.search as string) ?? undefined,
        customerId: (args.customerId as string) ?? undefined,
      });
      return JSON.stringify(result);
    }
    case "get_dashboard_summary": {
      const result = await getDashboardSummary(userId);
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
