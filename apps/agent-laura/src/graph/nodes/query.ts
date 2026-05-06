import { AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import type { LauraState } from "../state.js";
import { createLlm } from "../../config/providers.js";
import { LAURA_SYSTEM_PROMPT } from "../../prompts/system-prompt.js";
import { SYSTEM_QUERY_SECTION } from "../../prompts/prompt-sections.js";
import {
  searchProductsTool,
  searchCustomersTool,
  searchOpportunitiesTool,
  searchQuotesTool,
  searchOrdersTool,
  searchSegmentsTool,
  searchContactsTool,
  searchVisitsTool,
  searchFollowupsTool,
  getCustomerDetailsTool,
  getOpportunityDetailsTool,
  getProductDetailsTool,
  getQuoteDetailsTool,
  getOrderDetailsTool,
  getPendingTasksTool,
  getScheduledVisitsTool,
  getAgendaTool,
  getDashboardSummaryTool,
} from "../../tools/index.js";

const allQueryTools = [
  searchProductsTool,
  searchCustomersTool,
  searchOpportunitiesTool,
  searchQuotesTool,
  searchOrdersTool,
  searchSegmentsTool,
  searchContactsTool,
  searchVisitsTool,
  searchFollowupsTool,
  getCustomerDetailsTool,
  getOpportunityDetailsTool,
  getProductDetailsTool,
  getQuoteDetailsTool,
  getOrderDetailsTool,
  getPendingTasksTool,
  getScheduledVisitsTool,
  getAgendaTool,
  getDashboardSummaryTool,
];

export async function queryNode(state: LauraState): Promise<Partial<LauraState>> {
  const llm = createLlm().bindTools(allQueryTools);

  const contextMessages: string[] = [];
  if (state.customerContext) {
    contextMessages.push(`Contexto de cliente: ${state.customerContext.label} (ID: ${state.customerContext.id})`);
  }
  if (state.opportunityContext) {
    contextMessages.push(`Contexto de oportunidad: ${state.opportunityContext.label} (ID: ${state.opportunityContext.id})`);
  }

  const systemContent = `${LAURA_SYSTEM_PROMPT}\n\n${SYSTEM_QUERY_SECTION}\n\n${contextMessages.join("\n")}`;

  const currentMessages = [new SystemMessage(systemContent), ...state.messages];

  const maxIterations = 5;
  for (let i = 0; i < maxIterations; i++) {
    const response = await llm.invoke(currentMessages);

    if (response.content && !response.tool_calls?.length) {
      return {
        mode: "query",
        messages: [response],
      };
    }

    if (response.tool_calls?.length) {
      currentMessages.push(response);
      for (const toolCall of response.tool_calls) {
        const tool = allQueryTools.find(t => t.name === toolCall.name);
        if (tool) {
          try {
            const result = await (tool as StructuredTool).invoke(toolCall.args);
            currentMessages.push(new ToolMessage({
              content: typeof result === "string" ? result : JSON.stringify(result),
              tool_call_id: toolCall.id ?? `tc-${i}`,
            }));
          } catch (err) {
            currentMessages.push(new ToolMessage({
              content: `Error: ${err instanceof Error ? err.message : String(err)}`,
              tool_call_id: toolCall.id ?? `tc-${i}`,
            }));
          }
        }
      }
    }
  }

  return {
    mode: "query",
    messages: [new AIMessage("No pude obtener la informacion solicitada. Podrias reformular la consulta?")],
  };
}
