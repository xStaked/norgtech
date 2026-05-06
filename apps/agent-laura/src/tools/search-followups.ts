import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchFollowups as apiSearchFollowups } from "./nestjs-client.js";

export const searchFollowupsTool = tool(
  async ({ customerId, status }) => {
    const results = await apiSearchFollowups({ customerId, status });
    return JSON.stringify(results);
  },
  {
    name: "search_followups",
    description: "Buscar seguimientos pendientes o completados por cliente o estado.",
    schema: z.object({
      customerId: z.string().optional().describe("ID del cliente para filtrar seguimientos"),
      status: z.string().optional().describe("Estado del seguimiento (ej. pendiente, completado)"),
    }),
  },
);
