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
      "Get the list of scheduled visits for a user. Returns visit ID, summary, and scheduled date.",
    schema: z.object({
      userId: z.string().describe("The user ID whose visits to retrieve"),
    }),
  },
);