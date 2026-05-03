import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchCustomers } from "./nestjs-client.js";

export const searchCustomersTool = tool(
  async ({ query }) => {
    const results = await searchCustomers(query);
    return JSON.stringify(results);
  },
  {
    name: "search_customers",
    description:
      "Search for customers by name. Returns a list of matching customers with their IDs and display names. Use this when the user mentions a customer name and you need to find the exact customer record.",
    schema: z.object({
      query: z.string().describe("The customer name or partial name to search for"),
    }),
  },
);