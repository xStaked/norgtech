import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchVisits as apiSearchVisits } from "./nestjs-client.js";

export const searchVisitsTool = tool(
  async ({ customerId, status, dateFrom, dateTo }) => {
    const results = await apiSearchVisits({ customerId, status, dateFrom, dateTo });
    return JSON.stringify(results);
  },
  {
    name: "search_visits",
    description: "Buscar visitas programadas o realizadas por cliente, estado o rango de fechas.",
    schema: z.object({
      customerId: z.string().optional().describe("ID del cliente para filtrar visitas"),
      status: z.string().optional().describe("Estado de la visita (ej. programada, realizada, cancelada)"),
      dateFrom: z.string().optional().describe("Fecha de inicio (YYYY-MM-DD)"),
      dateTo: z.string().optional().describe("Fecha de fin (YYYY-MM-DD)"),
    }),
  },
);
