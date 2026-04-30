import type { CSSProperties, ReactNode } from "react";
import { crmTheme } from "@/components/ui/theme";

interface SectionCardProps {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padding?: string | number;
  style?: CSSProperties;
}

export function SectionCard({
  children,
  title,
  description,
  actions,
  padding = "20px",
  style,
}: SectionCardProps) {
  return (
    <section
      style={{
        background: crmTheme.colors.surface,
        border: `1px solid ${crmTheme.colors.border}`,
        borderRadius: crmTheme.radius.lg,
        boxShadow: crmTheme.shadow.card,
        padding,
        ...style,
      }}
    >
      {title || description || actions ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title ? (
              <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.15, color: crmTheme.colors.text }}>
                {title}
              </h2>
            ) : null}
            {description ? (
              <div style={{ marginTop: 6, fontSize: 14, color: crmTheme.colors.textMuted }}>
                {description}
              </div>
            ) : null}
          </div>
          {actions ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{actions}</div> : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}
