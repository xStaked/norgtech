import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createProduct as apiCreateProduct } from "./nestjs-client.js";

export const createProductTool = tool(
  async (data) => {
    const result = await apiCreateProduct(data);
    return JSON.stringify(result);
  },
  {
    name: "create_product",
    description: "Crear un nuevo producto en el catalogo del CRM.",
    schema: z.record(z.any()),
  },
);
