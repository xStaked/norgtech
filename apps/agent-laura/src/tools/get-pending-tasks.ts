import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getPendingTasks } from "./nestjs-client.js";

export const getPendingTasksTool = tool(
  async ({ userId }) => {
    const tasks = await getPendingTasks(userId);
    return JSON.stringify(tasks);
  },
  {
    name: "get_pending_tasks",
    description:
      "Get the list of pending follow-up tasks for a user. Returns each task with its title, due date, type (llamada/correo/reunion/whatsapp), associated customer name and contacts, and associated opportunity. Use this to answer questions about tasks, calls, follow-ups, or when the user asks about their schedule.",
    schema: z.object({
      userId: z.string().describe("The user ID whose tasks to retrieve"),
    }),
  },
);