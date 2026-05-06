import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getPendingTasks, getScheduledVisits } from "./nestjs-client.js";

export const getAgendaTool = tool(
  async ({ userId }) => {
    const [tasks, visits] = await Promise.all([
      getPendingTasks(userId),
      getScheduledVisits(userId),
    ]);
    return JSON.stringify({ tasks, visits });
  },
  {
    name: "get_agenda",
    description: "Obtener la agenda completa de un usuario incluyendo tareas pendientes y visitas programadas.",
    schema: z.object({
      userId: z.string().describe("El ID del usuario (por ejemplo, 'current' o un UUID)"),
    }),
  },
);
