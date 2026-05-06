import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getDashboardSummary } from "./nestjs-client.js";

export const getDashboardSummaryTool = tool(
  async ({ userId }) => {
    const result = await getDashboardSummary(userId);
    return JSON.stringify(result);
  },
  {
    name: "get_dashboard_summary",
    description: "Obtener el resumen del dashboard del CRM con metricas clave y KPIs.",
    schema: z.object({
      userId: z.string().optional().describe("ID del usuario para filtrar datos del dashboard"),
    }),
  },
);
