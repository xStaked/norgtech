import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateContact as apiUpdateContact } from "./nestjs-client.js";

export const updateContactTool = tool(
  async ({ id, data }) => {
    const result = await apiUpdateContact(id, data);
    return JSON.stringify(result);
  },
  {
    name: "update_contact",
    description: "Actualizar los datos de un contacto existente en el CRM.",
    schema: z.object({
      id: z.string().describe("El ID del contacto a actualizar"),
      data: z.record(z.any()).describe("Los campos a actualizar del contacto"),
    }),
  },
);
