import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createTask } from "./nestjs-client.js";

export const createTaskTool = tool(
  async ({ customerId, title, dueAt, type, opportunityId, notes }) => {
    const result = await createTask({
      customerId,
      title,
      dueAt,
      type,
      opportunityId,
      notes,
    });
    return JSON.stringify(result);
  },
  {
    name: "create_task",
    description:
      "Create a general task in the CRM. Use for administrative or follow-up tasks that don't fit the follow-up category.",
    schema: z.object({
      customerId: z.string().describe("The customer ID this task relates to"),
      title: z.string().describe("Short title for the task"),
      dueAt: z.string().optional().describe("ISO 8601 date when the task is due"),
      type: z.string().optional().describe("Type of task"),
      opportunityId: z.string().optional().describe("Optional opportunity ID to link"),
      notes: z.string().optional().describe("Additional notes for the task"),
    }),
  },
);