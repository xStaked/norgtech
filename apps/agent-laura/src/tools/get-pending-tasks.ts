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
      "Get the list of pending follow-up tasks for a user. Returns task ID, title, due date, and type.",
    schema: z.object({
      userId: z.string().describe("The user ID whose tasks to retrieve"),
    }),
  },
);