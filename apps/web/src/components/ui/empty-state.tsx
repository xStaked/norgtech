import type { ReactNode } from "react";
import { crmTheme } from "@/components/ui/theme";

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: "grid",
        justifyItems: "start",
        gap: 10,
        padding: "28px",
        borderRadius: crmTheme.radius.lg,
        border: `1px dashed ${crmTheme.colors.borderStrong}`,
        background: crmTheme.colors.surfaceMuted,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          display: "grid",
          placeItems: "center",
          borderRadius: 16,
          background: crmTheme.colors.primarySoft,
          color: crmTheme.colors.primary,
          fontWeight: 800,
        }}
      >
        0
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: crmTheme.colors.text }}>
        {title}
      </div>
      {description ? (
        <div style={{ maxWidth: 540, fontSize: 14, color: crmTheme.colors.textMuted }}>
          {description}
        </div>
      ) : null}
      {action ? <div style={{ marginTop: 4 }}>{action}</div> : null}
    </div>
  );
}
