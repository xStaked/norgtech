import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createOrder as apiCreateOrder } from "./nestjs-client.js";

export const createOrderTool = tool(
  async (data) => {
    const result = await apiCreateOrder(data);
    return JSON.stringify(result);
  },
  {
    name: "create_order",
    description: "Crear un nuevo pedido en el CRM.",
    schema: z.record(z.any()),
  },
);
