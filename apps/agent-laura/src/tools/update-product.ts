import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateProduct as apiUpdateProduct } from "./nestjs-client.js";

export const updateProductTool = tool(
  async ({ id, data }) => {
    const result = await apiUpdateProduct(id, data);
    return JSON.stringify(result);
  },
  {
    name: "update_product",
    description: "Actualizar los datos de un producto existente en el catalogo.",
    schema: z.object({
      id: z.string().describe("El ID del producto a actualizar"),
      data: z.record(z.any()).describe("Los campos a actualizar del producto"),
    }),
  },
);
