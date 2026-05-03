import type { LauraStateType } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { getPendingTasks, getScheduledVisits } from "../../tools/nestjs-client.js";
import type { AgendaItem } from "../../types.js";

export async function agendaNode(state: LauraStateType): Promise<Partial<LauraStateType>> {
  const [tasks, visits] = await Promise.all([
    getPendingTasks(state.userId),
    getScheduledVisits(state.userId),
  ]);

  const items: AgendaItem[] = [
    ...tasks.map((task) => ({
      id: task.id,
      type: "follow_up_task" as const,
      label: task.title,
      scheduledAt: task.dueAt,
    })),
    ...visits.map((visit) => ({
      id: visit.id,
      type: "visit" as const,
      label: visit.summary || "Visita programada",
      scheduledAt: visit.scheduledAt,
    })),
  ];

  const message = items.length > 0
    ? "Estas son tus prioridades comerciales actuales."
    : "No encontré pendientes activos en tu agenda.";

  return {
    mode: "agenda",
    agendaItems: items,
    messages: [...state.messages, new AIMessage(message)],
  };
}