import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getProductDetails } from "./nestjs-client.js";

export const getProductDetailsTool = tool(
  async ({ id }) => {
    const result = await getProductDetails(id);
    return JSON.stringify(result);
  },
  {
    name: "get_product_details",
    description: "Obtener detalles completos de un producto especifico por su ID.",
    schema: z.object({
      id: z.string().describe("El ID del producto"),
    }),
  },
);
