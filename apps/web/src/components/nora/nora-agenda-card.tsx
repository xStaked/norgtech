"use client";

import { MapPin, Phone, Calendar } from "lucide-react";
import { NoraAgendaItem } from "./nora-types";

const priorityLabels: Record<number, { label: string; className: string }> = {
  0: { label: "Vencida", className: "bg-red-500/15 text-red-400" },
  1: { label: "Hoy", className: "bg-amber-500/15 text-amber-400" },
  2: { label: "Hoy", className: "bg-nora-500/15 text-nora-300" },
  3: { label: "Esta semana", className: "bg-muted text-muted-foreground" },
};

const typeConfig: Record<string, { label: string; icon: typeof MapPin }> = {
  visit: { label: "Visita", icon: MapPin },
  follow_up_task: { label: "Seguimiento", icon: Phone },
};

function formatAgendaDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const itemDate = new Date(date);
  itemDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((itemDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  if (diffDays === 0) return `Hoy a las ${timeStr}`;
  if (diffDays === 1) return `Mañana a las ${timeStr}`;

  const dateStrFormatted = new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);

  return `${dateStrFormatted.charAt(0).toUpperCase() + dateStrFormatted.slice(1)}, ${timeStr}`;
}

function cleanLabel(label: string, type: string): string {
  let cleaned = label;
  if (type === "visit") cleaned = cleaned.replace(/^Visita:\s*/i, "");
  else if (type === "follow_up_task") cleaned = cleaned.replace(/^Tarea:\s*/i, "");
  cleaned = cleaned.replace(/\s*-\s*Vence:\s*.*/, "");
  cleaned = cleaned.replace(/\s*-\s*None\s*$/i, "");
  cleaned = cleaned.replace(/\s*-\s*N\/A\s*$/i, "");
  return cleaned.trim() || "Sin descripción";
}

export function NoraAgendaCard({ items }: { items: NoraAgendaItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay pendientes activos en tu agenda.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const priority = priorityLabels[item.priorityGroup ?? 3] ?? priorityLabels[3];
        const type = typeConfig[item.type] ?? { label: item.type, icon: MapPin };
        const Icon = type.icon;
        const cleanedLabel = cleanLabel(item.label, item.type);
        const dateFormatted = formatAgendaDate(item.scheduledAt);

        return (
          <div
            key={item.id}
            className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-card/60 p-2.5 transition-all hover:border-nora-500/30 hover:bg-nora-500/5"
          >
            <div className="mt-0.5 shrink-0 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${priority.className}`}>
                  {priority.label}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{type.label}</span>
              </div>
              <p className="text-sm font-medium text-foreground leading-snug">{cleanedLabel}</p>
              {dateFormatted && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" strokeWidth={2} />
                  <span>{dateFormatted}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
