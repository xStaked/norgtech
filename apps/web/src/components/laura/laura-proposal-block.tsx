"use client";

import type { ReactNode } from "react";
import { MessageSquare, Target, CalendarClock, ClipboardList, Activity } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import { LauraToggle } from "./laura-toggle";

const blockIcons: Record<string, typeof MessageSquare> = {
  Interacción: MessageSquare,
  Oportunidad: Target,
  Seguimiento: CalendarClock,
  "Tarea interna": ClipboardList,
  "Señales comerciales": Activity,
};

export function LauraProposalBlock({
  title,
  description,
  enabled,
  onToggle,
  toggleLabel,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  toggleLabel: string;
  children: ReactNode;
}) {
  const Icon = blockIcons[title] ?? MessageSquare;

  return (
    <section
      style={{
        display: "grid",
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${enabled ? crmTheme.laura.border : crmTheme.colors.border}`,
        background: crmTheme.colors.surface,
        opacity: enabled ? 1 : 0.5,
        transition: "opacity 0.2s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          background: enabled ? crmTheme.laura.gradient : crmTheme.colors.surfaceMuted,
          transition: "background 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: enabled ? "rgba(255,255,255,0.2)" : crmTheme.colors.border,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={16} color={enabled ? "#ffffff" : crmTheme.colors.textMuted} strokeWidth={2} />
          </div>
          <div style={{ display: "grid", gap: 2 }}>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: enabled ? "#ffffff" : crmTheme.colors.text,
              }}
            >
              {title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.4,
                color: enabled ? "rgba(255,255,255,0.8)" : crmTheme.colors.textMuted,
              }}
            >
              {description}
            </p>
          </div>
        </div>

        <LauraToggle checked={enabled} onChange={onToggle} label={toggleLabel} />
      </div>

      <div style={{ display: "grid", gap: 12, padding: "14px 16px" }}>{children}</div>
    </section>
  );
}
