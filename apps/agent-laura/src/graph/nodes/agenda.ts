import type { LauraState } from "../state.js";
import { AIMessage } from "@langchain/core/messages";
import { getPendingTasks, getScheduledVisits } from "../../tools/nestjs-client.js";
import type { AgendaItem } from "../../types.js";

export async function agendaNode(state: LauraState): Promise<Partial<LauraState>> {
  const [tasks, visits] = await Promise.all([
    getPendingTasks(state.userId),
    getScheduledVisits(state.userId),
  ]);

  const items: AgendaItem[] = [
    ...tasks.map((task) => ({
      id: task.id,
      type: "follow_up_task" as const,
      label: task.customer
        ? `${task.title} - ${task.customer.displayName}`
        : task.title,
      scheduledAt: task.dueAt,
    })),
    ...visits.map((visit) => ({
      id: visit.id,
      type: "visit" as const,
      label: visit.customer
        ? `${visit.summary || "Visita programada"} - ${visit.customer.displayName}`
        : visit.summary || "Visita programada",
      scheduledAt: visit.scheduledAt,
    })),
  ];

  let message: string;
  if (items.length === 0) {
    message = "No encontré pendientes activos en tu agenda.";
  } else {
    const itemLines = items.map((item) => {
      const typeLabel = item.type === "visit" ? "Visita" : "Tarea";
      const time = item.scheduledAt ? ` - ${new Date(item.scheduledAt).toLocaleString("es-AR")}` : "";
      return `${typeLabel}: ${item.label}${time}`;
    });
    message = `Estas son tus prioridades comerciales actuales:\n${itemLines.join("\n")}`;
  }

  return {
    mode: "agenda",
    agendaItems: items,
    messages: [...state.messages, new AIMessage(message)],
  };
}