import type { ReactNode } from "react";
import { crmTheme, type CrmStatusTone, getStatusToneColor } from "@/components/ui/theme";

interface InlineMetricProps {
  label: ReactNode;
  value: ReactNode;
  tone?: CrmStatusTone;
}

export function InlineMetric({
  label,
  value,
  tone = "info",
}: InlineMetricProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 8,
        padding: "10px 12px",
        borderRadius: crmTheme.radius.md,
        background: crmTheme.colors.surface,
        border: `1px solid ${crmTheme.colors.border}`,
      }}
    >
      <span style={{ fontSize: 13, color: crmTheme.colors.textMuted }}>
        {label}
      </span>
      <span style={{ fontSize: 18, fontWeight: 800, color: getStatusToneColor(tone) }}>
        {value}
      </span>
    </div>
  );
}
