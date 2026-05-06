import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateFollowup as apiUpdateFollowup } from "./nestjs-client.js";

export const updateFollowupTool = tool(
  async ({ id, data }) => {
    const result = await apiUpdateFollowup(id, data);
    return JSON.stringify(result);
  },
  {
    name: "update_followup",
    description: "Actualizar los datos de un seguimiento existente.",
    schema: z.object({
      id: z.string().describe("El ID del seguimiento a actualizar"),
      data: z.record(z.any()).describe("Los campos a actualizar del seguimiento"),
    }),
  },
);
