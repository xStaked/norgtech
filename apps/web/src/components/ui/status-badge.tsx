import type { ReactNode } from "react";
import { crmTheme, type CrmStatusTone, getStatusToneColor } from "@/components/ui/theme";

interface StatusBadgeProps {
  children: ReactNode;
  tone?: CrmStatusTone;
}

export function StatusBadge({
  children,
  tone = "neutral",
}: StatusBadgeProps) {
  const color = getStatusToneColor(tone);
  const background =
    tone === "neutral" ? crmTheme.colors.surfaceEmphasis : `${color}1a`;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: 28,
        padding: "4px 10px",
        borderRadius: crmTheme.radius.pill,
        background,
        color,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
        }}
      />
      {children}
    </span>
  );
}
