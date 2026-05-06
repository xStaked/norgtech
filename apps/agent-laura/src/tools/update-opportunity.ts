import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateOpportunity as apiUpdateOpportunity } from "./nestjs-client.js";

export const updateOpportunityTool = tool(
  async ({ id, data }) => {
    const result = await apiUpdateOpportunity(id, data);
    return JSON.stringify(result);
  },
  {
    name: "update_opportunity",
    description: "Actualizar los datos de una oportunidad de venta existente.",
    schema: z.object({
      id: z.string().describe("El ID de la oportunidad a actualizar"),
      data: z.record(z.any()).describe("Los campos a actualizar de la oportunidad"),
    }),
  },
);
