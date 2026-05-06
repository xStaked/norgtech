import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchSegments } from "./nestjs-client.js";

export const searchSegmentsTool = tool(
  async (_params) => {
    const results = await searchSegments();
    return JSON.stringify(results);
  },
  {
    name: "search_segments",
    description: "Listar todos los segmentos de clientes disponibles en el CRM.",
    schema: z.object({}),
  },
);
