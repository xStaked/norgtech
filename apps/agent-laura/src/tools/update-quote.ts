import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateQuoteStatus as apiUpdateQuoteStatus } from "./nestjs-client.js";

export const updateQuoteTool = tool(
  async ({ id, status }) => {
    const result = await apiUpdateQuoteStatus(id, { status });
    return JSON.stringify(result);
  },
  {
    name: "update_quote",
    description: "Actualizar el estado de una cotizacion existente.",
    schema: z.object({
      id: z.string().describe("El ID de la cotizacion a actualizar"),
      status: z.string().describe("El nuevo estado de la cotizacion"),
    }),
  },
);
