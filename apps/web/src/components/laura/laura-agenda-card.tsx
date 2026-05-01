"use client";

import { crmTheme } from "@/components/ui/theme";
import type { LauraAgendaItem } from "./laura-types";

const priorityLabels: Record<number, { label: string; tone: "danger" | "warning" | "info" | "muted" }> = {
  0: { label: "Vencida", tone: "danger" },
  1: { label: "Hoy", tone: "warning" },
  2: { label: "Hoy", tone: "info" },
  3: { label: "Esta semana", tone: "muted" },
};

const typeLabels: Record<string, string> = {
  visit: "Visita",
  follow_up_task: "Seguimiento",
};

export function LauraAgendaCard({ items }: { items: LauraAgendaItem[] }) {
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: crmTheme.colors.textMuted }}>
        No hay pendientes activos en tu agenda.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => {
        const priority = priorityLabels[item.priorityGroup ?? 3] ?? priorityLabels[3];
        const typeLabel = typeLabels[item.type] ?? item.type;

        return (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: crmTheme.radius.md,
              border: `1px solid ${crmTheme.colors.border}`,
              background: crmTheme.colors.surface,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: crmTheme.radius.pill,
                background:
                  priority.tone === "danger"
                    ? "rgba(186, 58, 47, 0.12)"
                    : priority.tone === "warning"
                      ? "rgba(234, 179, 8, 0.12)"
                      : priority.tone === "info"
                        ? "rgba(45, 108, 223, 0.08)"
                        : crmTheme.colors.surfaceMuted,
                color:
                  priority.tone === "danger"
                    ? crmTheme.colors.danger
                    : priority.tone === "warning"
                      ? "#b45309"
                      : priority.tone === "info"
                        ? crmTheme.colors.info
                        : crmTheme.colors.textMuted,
              }}
            >
              {priority.label}
            </span>
            <span style={{ fontSize: 12, color: crmTheme.colors.textMuted, minWidth: 80 }}>
              {typeLabel}
            </span>
            <span style={{ fontSize: 14, color: crmTheme.colors.text }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}