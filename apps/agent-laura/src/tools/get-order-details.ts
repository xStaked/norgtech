import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getOrderDetails } from "./nestjs-client.js";

export const getOrderDetailsTool = tool(
  async ({ id }) => {
    const result = await getOrderDetails(id);
    return JSON.stringify(result);
  },
  {
    name: "get_order_details",
    description: "Obtener detalles completos de un pedido especifico por su ID, incluyendo line items y estado de envio.",
    schema: z.object({
      id: z.string().describe("El ID del pedido"),
    }),
  },
);
