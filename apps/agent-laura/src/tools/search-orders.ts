import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchOrders as apiSearchOrders } from "./nestjs-client.js";

export const searchOrdersTool = tool(
  async ({ customerId, status, search }) => {
    const results = await apiSearchOrders({ customerId, status, search });
    return JSON.stringify(results);
  },
  {
    name: "search_orders",
    description: "Buscar pedidos por cliente, estado o termino de busqueda.",
    schema: z.object({
      customerId: z.string().optional().describe("ID del cliente para filtrar pedidos"),
      status: z.string().optional().describe("Estado del pedido (ej. pendiente, enviado, entregado)"),
      search: z.string().optional().describe("Termino de busqueda general"),
    }),
  },
);
