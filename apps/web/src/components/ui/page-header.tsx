import type { ReactNode } from "react";
import { crmTheme } from "@/components/ui/theme";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 18,
      }}
    >
      <div style={{ minWidth: 0, maxWidth: 820 }}>
        {eyebrow ? (
          <div
            style={{
              marginBottom: 8,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: crmTheme.colors.info,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1
          style={{
            margin: 0,
            fontSize: 32,
            lineHeight: 1.02,
            letterSpacing: "-0.04em",
            color: crmTheme.colors.text,
          }}
        >
          {title}
        </h1>
        {description ? (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 15,
              color: crmTheme.colors.textMuted,
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{actions}</div> : null}
    </div>
  );
}
