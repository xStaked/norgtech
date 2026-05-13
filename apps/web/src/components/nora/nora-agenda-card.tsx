"use client";

import { MapPin, Phone, Calendar } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import { NoraAgendaItem } from "./nora-types";

const priorityLabels: Record<number, { label: string; bg: string; color: string }> = {
  0: { label: "Vencida", bg: "rgba(220,38,38,0.12)", color: "#dc2626" },
  1: { label: "Hoy", bg: "rgba(234,179,8,0.12)", color: "#b45309" },
  2: { label: "Hoy", bg: crmTheme.nora.soft, color: crmTheme.nora.primary },
  3: { label: "Esta semana", bg: crmTheme.colors.surfaceMuted, color: crmTheme.colors.textMuted },
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
  // Quitar prefijos comunes que ya mostramos con el badge
  if (type === "visit") {
    cleaned = cleaned.replace(/^Visita:\s*/i, "");
  } else if (type === "follow_up_task") {
    cleaned = cleaned.replace(/^Tarea:\s*/i, "");
  }
  // Quitar " - Vence: ..." o " - None" del final
  cleaned = cleaned.replace(/\s*-\s*Vence:\s*.*/, "");
  cleaned = cleaned.replace(/\s*-\s*None\s*$/i, "");
  cleaned = cleaned.replace(/\s*-\s*N\/A\s*$/i, "");
  cleaned = cleaned.trim();
  return cleaned || "Sin descripción";
}

export function NoraAgendaCard({ items }: { items: NoraAgendaItem[] }) {
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: crmTheme.nora.textMuted }}>
        No hay pendientes activos en tu agenda.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => {
        const priority = priorityLabels[item.priorityGroup ?? 3] ?? priorityLabels[3];
        const type = typeConfig[item.type] ?? { label: item.type, icon: MapPin };
        const Icon = type.icon;
        const cleanedLabel = cleanLabel(item.label, item.type);
        const dateFormatted = formatAgendaDate(item.scheduledAt);

        return (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: crmTheme.radius.md,
              border: `1px solid ${crmTheme.nora.border}`,
              background: crmTheme.colors.surface,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = crmTheme.nora.surface;
              e.currentTarget.style.borderColor = crmTheme.nora.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = crmTheme.colors.surface;
              e.currentTarget.style.borderColor = crmTheme.nora.border;
            }}
          >
            <div style={{ paddingTop: 2, flexShrink: 0 }}>
              <Icon size={14} color={crmTheme.nora.textMuted} strokeWidth={2} />
            </div>
            <div style={{ display: "grid", gap: 4, flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: crmTheme.radius.pill,
                    background: priority.bg,
                    color: priority.color,
                  }}
                >
                  {priority.label}
                </span>
                <span style={{ fontSize: 12, color: crmTheme.nora.textMuted, fontWeight: 600 }}>
                  {type.label}
                </span>
              </div>
              <span
                style={{
                  fontSize: 14,
                  color: crmTheme.nora.textPrimary,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                {cleanedLabel}
              </span>
              {dateFormatted && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: crmTheme.nora.textSubtle,
                  }}
                >
                  <Calendar size={11} strokeWidth={2} />
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
