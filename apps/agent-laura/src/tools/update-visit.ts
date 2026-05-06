import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateVisit as apiUpdateVisit } from "./nestjs-client.js";

export const updateVisitTool = tool(
  async ({ id, data }) => {
    const result = await apiUpdateVisit(id, data);
    return JSON.stringify(result);
  },
  {
    name: "update_visit",
    description: "Actualizar los datos de una visita programada o realizada.",
    schema: z.object({
      id: z.string().describe("El ID de la visita a actualizar"),
      data: z.record(z.any()).describe("Los campos a actualizar de la visita"),
    }),
  },
);
