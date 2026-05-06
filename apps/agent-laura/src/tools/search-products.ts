import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchProducts as apiSearchProducts } from "./nestjs-client.js";

export const searchProductsTool = tool(
  async ({ search, active }) => {
    const results = await apiSearchProducts({ search, active });
    return JSON.stringify(results);
  },
  {
    name: "search_products",
    description: "Buscar productos por nombre o SKU. Util para consultar el catalogo de productos disponibles.",
    schema: z.object({
      search: z.string().optional().describe("Texto de busqueda (nombre o SKU del producto)"),
      active: z.boolean().optional().describe("Filtrar solo productos activos"),
    }),
  },
);
