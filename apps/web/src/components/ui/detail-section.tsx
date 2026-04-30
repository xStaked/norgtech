import type { ReactNode } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { crmTheme } from "@/components/ui/theme";

interface DetailField {
  label: ReactNode;
  value: ReactNode;
}

interface DetailSectionProps {
  title: ReactNode;
  description?: ReactNode;
  fields: readonly DetailField[];
  aside?: ReactNode;
}

export function DetailSection({
  title,
  description,
  fields,
  aside,
}: DetailSectionProps) {
  return (
    <SectionCard title={title} description={description}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: aside ? "minmax(0, 1fr) 280px" : "minmax(0, 1fr)",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
          }}
        >
          {fields.map((field, index) => (
            <div
              key={index}
              style={{
                padding: "14px 16px",
                borderRadius: crmTheme.radius.md,
                background: crmTheme.colors.surfaceMuted,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>
                {field.label}
              </div>
              <div style={{ marginTop: 6, fontSize: 15, color: crmTheme.colors.text }}>
                {field.value}
              </div>
            </div>
          ))}
        </div>
        {aside ? <aside>{aside}</aside> : null}
      </div>
    </SectionCard>
  );
}
