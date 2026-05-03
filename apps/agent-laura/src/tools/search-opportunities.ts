import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchOpportunities } from "./nestjs-client.js";

export const searchOpportunitiesTool = tool(
  async ({ query }) => {
    const results = await searchOpportunities(query);
    return JSON.stringify(results);
  },
  {
    name: "search_opportunities",
    description:
      "Search for opportunities by title. Returns a list of matching opportunities with their IDs and titles.",
    schema: z.object({
      query: z.string().describe("The opportunity title or partial title to search for"),
    }),
  },
);