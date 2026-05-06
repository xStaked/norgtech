import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchContacts as apiSearchContacts } from "./nestjs-client.js";

export const searchContactsTool = tool(
  async ({ search, customerId }) => {
    const results = await apiSearchContacts({ search, customerId });
    return JSON.stringify(results);
  },
  {
    name: "search_contacts",
    description: "Buscar contactos por nombre, email o empresa. Se puede filtrar por cliente especifico.",
    schema: z.object({
      search: z.string().optional().describe("Texto de busqueda (nombre, email, etc.)"),
      customerId: z.string().optional().describe("ID del cliente para filtrar contactos de una empresa especifica"),
    }),
  },
);
