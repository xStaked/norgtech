import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createInteraction } from "./nestjs-client.js";

export const createInteractionTool = tool(
  async ({ customerId, summary, rawMessage, opportunityId, occurredAt, nextStep, signals }) => {
    const result = await createInteraction({
      customerId,
      summary,
      rawMessage,
      opportunityId,
      occurredAt,
      nextStep,
      signals,
    });
    return JSON.stringify(result);
  },
  {
    name: "create_interaction",
    description:
      "Create a commercial interaction (visit record) in the CRM. This persists a customer interaction with its summary and metadata.",
    schema: z.object({
      customerId: z.string().describe("The customer ID this interaction relates to"),
      summary: z.string().describe("A concise summary of the interaction"),
      rawMessage: z.string().describe("The original user message describing the interaction"),
      opportunityId: z.string().optional().describe("Optional opportunity ID to link"),
      occurredAt: z.string().optional().describe("ISO 8601 date when the interaction occurred"),
      nextStep: z.string().optional().describe("Suggested next step"),
      signals: z.record(z.unknown()).optional().describe("Signal data including objections, risk, buying intent"),
    }),
  },
);