import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getScheduledVisits } from "./nestjs-client.js";

export const getScheduledVisitsTool = tool(
  async ({ userId }) => {
    const visits = await getScheduledVisits(userId);
    return JSON.stringify(visits);
  },
  {
    name: "get_scheduled_visits",
    description:
      "Get the list of scheduled visits for a user. Returns each visit with its summary, scheduled date, associated customer name and contacts, and associated opportunity. Use this to answer questions about scheduled visits or meetings.",
    schema: z.object({
      userId: z.string().describe("The user ID whose visits to retrieve"),
    }),
  },
);