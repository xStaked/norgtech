"use client";

import { MapPin, Phone } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import type { LauraAgendaItem } from "./laura-types";

const priorityLabels: Record<number, { label: string; bg: string; color: string }> = {
  0: { label: "Vencida", bg: "rgba(220,38,38,0.12)", color: "#dc2626" },
  1: { label: "Hoy", bg: "rgba(234,179,8,0.12)", color: "#b45309" },
  2: { label: "Hoy", bg: crmTheme.laura.soft, color: crmTheme.laura.primary },
  3: { label: "Esta semana", bg: crmTheme.colors.surfaceMuted, color: crmTheme.colors.textMuted },
};

const typeConfig: Record<string, { label: string; icon: typeof MapPin }> = {
  visit: { label: "Visita", icon: MapPin },
  follow_up_task: { label: "Seguimiento", icon: Phone },
};

export function LauraAgendaCard({ items }: { items: LauraAgendaItem[] }) {
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: crmTheme.laura.textMuted }}>
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

        return (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: crmTheme.radius.md,
              border: `1px solid ${crmTheme.laura.border}`,
              background: crmTheme.colors.surface,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = crmTheme.laura.surface;
              e.currentTarget.style.borderColor = crmTheme.laura.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = crmTheme.colors.surface;
              e.currentTarget.style.borderColor = crmTheme.laura.border;
            }}
          >
            <Icon size={14} color={crmTheme.laura.textMuted} strokeWidth={2} />
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
            <span style={{ fontSize: 12, color: crmTheme.laura.textMuted, minWidth: 80 }}>
              {type.label}
            </span>
            <span style={{ fontSize: 14, color: crmTheme.laura.textPrimary }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
