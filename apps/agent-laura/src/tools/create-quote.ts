import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createQuote as apiCreateQuote } from "./nestjs-client.js";

export const createQuoteTool = tool(
  async (data) => {
    const result = await apiCreateQuote(data);
    return JSON.stringify(result);
  },
  {
    name: "create_quote",
    description: "Crear una nueva cotizacion en el CRM.",
    schema: z.record(z.any()),
  },
);
