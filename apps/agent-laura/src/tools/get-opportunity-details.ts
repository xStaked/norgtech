import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getOpportunityDetails } from "./nestjs-client.js";

export const getOpportunityDetailsTool = tool(
  async ({ opportunityId }) => {
    const details = await getOpportunityDetails(opportunityId);
    return JSON.stringify(details);
  },
  {
    name: "get_opportunity_details",
    description:
      "Get detailed information about a specific opportunity by ID. Returns opportunity title, stage, customer, and other details.",
    schema: z.object({
      opportunityId: z.string().describe("The opportunity ID to look up"),
    }),
  },
);