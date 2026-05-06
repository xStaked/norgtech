import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateCustomer as apiUpdateCustomer } from "./nestjs-client.js";

export const updateCustomerTool = tool(
  async ({ id, data }) => {
    const result = await apiUpdateCustomer(id, data);
    return JSON.stringify(result);
  },
  {
    name: "update_customer",
    description: "Actualizar los datos de un cliente existente en el CRM.",
    schema: z.object({
      id: z.string().describe("El ID del cliente a actualizar"),
      data: z.record(z.any()).describe("Los campos a actualizar del cliente"),
    }),
  },
);
