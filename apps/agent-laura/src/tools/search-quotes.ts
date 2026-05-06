import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchQuotes as apiSearchQuotes } from "./nestjs-client.js";

export const searchQuotesTool = tool(
  async ({ customerId, status, search }) => {
    const results = await apiSearchQuotes({ customerId, status, search });
    return JSON.stringify(results);
  },
  {
    name: "search_quotes",
    description: "Buscar cotizaciones por cliente, estado o termino de busqueda.",
    schema: z.object({
      customerId: z.string().optional().describe("ID del cliente para filtrar cotizaciones"),
      status: z.string().optional().describe("Estado de la cotizacion (ej. pendiente, aprobada, rechazada)"),
      search: z.string().optional().describe("Termino de busqueda general"),
    }),
  },
);
