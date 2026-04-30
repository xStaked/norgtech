import type { ReactNode } from "react";
import { crmTheme } from "@/components/ui/theme";

interface FilterBarProps {
  children?: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
}

export function FilterBar({
  children,
  summary,
  actions,
}: FilterBarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: crmTheme.radius.lg,
        background: crmTheme.colors.surface,
        border: `1px solid ${crmTheme.colors.border}`,
        boxShadow: crmTheme.shadow.card,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {children}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {summary ? (
          <div style={{ fontSize: 13, color: crmTheme.colors.textMuted }}>
            {summary}
          </div>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
