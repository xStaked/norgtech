import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createFollowUp } from "./nestjs-client.js";

export const createFollowUpTool = tool(
  async ({ customerId, title, dueAt, type, opportunityId }) => {
    const result = await createFollowUp({
      customerId,
      title,
      dueAt,
      type,
      opportunityId,
    });
    return JSON.stringify(result);
  },
  {
    name: "create_followup",
    description:
      "Create a follow-up task in the CRM. This schedules a future action (call, meeting, etc.) for a commercial contact.",
    schema: z.object({
      customerId: z.string().describe("The customer ID this follow-up relates to"),
      title: z.string().describe("Short title for the follow-up"),
      dueAt: z.string().describe("ISO 8601 date when the follow-up is due"),
      type: z.string().describe("Type of follow-up: llamada, email, whatsapp, reunion, recordatorio"),
      opportunityId: z.string().optional().describe("Optional opportunity ID to link"),
    }),
  },
);