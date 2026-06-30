"use client";

import Link from "next/link";
import { MapPin, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { computeUrgency, UrgencyBadge } from "./urgency-badge";

interface Customer {
  id: string;
  displayName: string;
}

interface QueueItem {
  id: string;
  kind: "visit" | "task";
  title: string;
  customer: Customer | null;
  scheduledAt: string;
  status: string;
  type?: string;
}

interface AgendaQueueProps {
  items: QueueItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const kindLabels: Record<string, string> = {
  visit: "Visita",
  task: "Seguimiento",
};

const typeLabels: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
  recordatorio: "Recordatorio",
  otro: "Otro",
};

export function AgendaQueue({ items, emptyTitle, emptyDescription }: AgendaQueueProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? "Sin elementos"}
        description={emptyDescription ?? "No hay actividades para mostrar en esta vista."}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
      {items.map((item) => {
        const urgency = computeUrgency(item.scheduledAt, item.status, item.kind);
        const href = item.kind === "visit" ? `/visits/${item.id}` : `/follow-ups/${item.id}`;
        const meta =
          item.kind === "task"
            ? typeLabels[item.type ?? ""] ?? item.type ?? "Seguimiento"
            : kindLabels[item.kind];
        const isVisit = item.kind === "visit";

        return (
          <Link
            key={`${item.kind}-${item.id}`}
            href={href}
            className="flex items-start gap-3 rounded-[11px] border border-border bg-card p-4 text-inherit no-underline transition-colors hover:border-[#c7d3df]"
          >
            <span
              aria-hidden="true"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-white"
              style={{ backgroundColor: isVisit ? "#0f5c8a" : "#6d4ff0" }}
            >
              {isVisit ? <MapPin className="h-[18px] w-[18px]" /> : <Clock className="h-[18px] w-[18px]" />}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  {meta}
                </span>
                <UrgencyBadge level={urgency} />
              </div>

              <div className="mt-1 truncate text-[13.5px] font-bold text-foreground">
                {item.title}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                  {item.customer?.displayName ?? "Sin cliente"}
                </span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#3a4658]">
                  {dateTimeFormatter.format(new Date(item.scheduledAt))}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
