import type { ReactNode } from "react";
import { SectionCard } from "@/components/ui/section-card";

interface FormSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

export function FormSection({
  title,
  description,
  children,
  actions,
}: FormSectionProps) {
  return (
    <SectionCard title={title} description={description} actions={actions}>
      <div style={{ display: "grid", gap: 16 }}>
        {children}
      </div>
    </SectionCard>
  );
}
