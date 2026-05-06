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
      "Search for customers by name, company name, or contact name. Returns matching customers with their IDs, display names, and contact persons (with names, roles, emails, and phones). Use this when the user mentions a person's name or company name and you need to find the exact customer record.",
    schema: z.object({
      query: z.string().describe("The customer name, company name, or contact name to search for"),
    }),
  },
);