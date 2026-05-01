"use client";

import type { ReactNode } from "react";
import { crmTheme } from "@/components/ui/theme";

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
  return (
    <section
      style={{
        display: "grid",
        gap: 14,
        padding: "16px 18px",
        borderRadius: crmTheme.radius.lg,
        border: `1px solid ${enabled ? crmTheme.colors.borderStrong : crmTheme.colors.border}`,
        background: enabled ? "#fbfdff" : crmTheme.colors.surfaceMuted,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              color: crmTheme.colors.text,
            }}
          >
            {title}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: crmTheme.colors.textMuted,
            }}
          >
            {description}
          </p>
        </div>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            fontWeight: 700,
            color: crmTheme.colors.text,
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label={toggleLabel}
          />
          Guardar
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          opacity: enabled ? 1 : 0.64,
        }}
      >
        {children}
      </div>
    </section>
  );
}
