import type { ReactNode } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { crmTheme, type CrmStatusTone, getStatusToneColor } from "@/components/ui/theme";

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  tone?: CrmStatusTone;
  meta?: ReactNode;
}

export function StatCard({
  label,
  value,
  tone = "info",
  meta,
}: StatCardProps) {
  const accent = getStatusToneColor(tone);

  return (
    <SectionCard
      padding="18px"
      style={{
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "0 auto auto 0",
          width: 64,
          height: 4,
          background: accent,
          borderBottomRightRadius: 999,
        }}
      />
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: crmTheme.colors.textMuted }}>
          {label}
        </div>
        <div style={{ fontSize: 32, lineHeight: 1, fontWeight: 800, color: crmTheme.colors.text }}>
          {value}
        </div>
        {meta ? (
          <div style={{ fontSize: 13, color: crmTheme.colors.textSubtle }}>
            {meta}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
