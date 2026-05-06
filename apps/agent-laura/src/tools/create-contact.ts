import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createContact as apiCreateContact } from "./nestjs-client.js";

export const createContactTool = tool(
  async (data) => {
    const result = await apiCreateContact(data);
    return JSON.stringify(result);
  },
  {
    name: "create_contact",
    description: "Crear un nuevo contacto en el CRM asociado a un cliente.",
    schema: z.record(z.any()),
  },
);
