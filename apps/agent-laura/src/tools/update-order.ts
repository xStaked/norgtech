import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateOrderStatus as apiUpdateOrderStatus } from "./nestjs-client.js";

export const updateOrderTool = tool(
  async ({ id, status, notes }) => {
    const result = await apiUpdateOrderStatus(id, { status, notes });
    return JSON.stringify(result);
  },
  {
    name: "update_order",
    description: "Actualizar el estado de un pedido existente.",
    schema: z.object({
      id: z.string().describe("El ID del pedido a actualizar"),
      status: z.string().describe("El nuevo estado del pedido"),
      notes: z.string().optional().describe("Notas adicionales sobre el cambio de estado"),
    }),
  },
);
