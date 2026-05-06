import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createCustomer as apiCreateCustomer } from "./nestjs-client.js";

export const createCustomerTool = tool(
  async (data) => {
    const result = await apiCreateCustomer(data);
    return JSON.stringify(result);
  },
  {
    name: "create_customer",
    description: "Crear un nuevo cliente en el CRM.",
    schema: z.record(z.any()),
  },
);
