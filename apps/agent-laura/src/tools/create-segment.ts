import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createSegment as apiCreateSegment } from "./nestjs-client.js";

export const createSegmentTool = tool(
  async (data) => {
    const result = await apiCreateSegment(data);
    return JSON.stringify(result);
  },
  {
    name: "create_segment",
    description: "Crear un nuevo segmento de clientes en el CRM.",
    schema: z.record(z.any()),
  },
);
