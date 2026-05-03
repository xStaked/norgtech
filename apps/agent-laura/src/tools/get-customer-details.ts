import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCustomerDetails } from "./nestjs-client.js";

export const getCustomerDetailsTool = tool(
  async ({ customerId }) => {
    const details = await getCustomerDetails(customerId);
    return JSON.stringify(details);
  },
  {
    name: "get_customer_details",
    description:
      "Get detailed information about a specific customer by ID. Returns customer name, contacts, and other details.",
    schema: z.object({
      customerId: z.string().describe("The customer ID to look up"),
    }),
  },
);