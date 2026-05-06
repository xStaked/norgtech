import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getQuoteDetails } from "./nestjs-client.js";

export const getQuoteDetailsTool = tool(
  async ({ id }) => {
    const result = await getQuoteDetails(id);
    return JSON.stringify(result);
  },
  {
    name: "get_quote_details",
    description: "Obtener detalles completos de una cotizacion especifica por su ID, incluyendo line items y totales.",
    schema: z.object({
      id: z.string().describe("El ID de la cotizacion"),
    }),
  },
);
