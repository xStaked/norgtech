import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateSegment as apiUpdateSegment } from "./nestjs-client.js";

export const updateSegmentTool = tool(
  async ({ id, data }) => {
    const result = await apiUpdateSegment(id, data);
    return JSON.stringify(result);
  },
  {
    name: "update_segment",
    description: "Actualizar los datos de un segmento de clientes existente.",
    schema: z.object({
      id: z.string().describe("El ID del segmento a actualizar"),
      data: z.record(z.any()).describe("Los campos a actualizar del segmento"),
    }),
  },
);
