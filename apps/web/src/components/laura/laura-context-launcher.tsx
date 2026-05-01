"use client";

import { MessageSquare } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionCard } from "@/components/ui/section-card";
import { crmTheme } from "@/components/ui/theme";

interface LauraContextLauncherProps {
  contextType: "customer" | "opportunity";
  contextEntityId: string;
  contextLabel: string;
}

export function LauraContextLauncher({
  contextType,
  contextEntityId,
  contextLabel,
}: LauraContextLauncherProps) {
  const searchParams = new URLSearchParams({
    contextType,
    contextEntityId,
    contextLabel,
  });

  return (
    <SectionCard
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: crmTheme.laura.gradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MessageSquare size={14} color="#ffffff" strokeWidth={2.5} />
          </div>
          Laura
        </span>
      }
      description={`Reportá una visita o seguimiento con contexto de ${contextLabel} usando lenguaje natural.`}
      actions={
        <ButtonLink href={`/laura?${searchParams.toString()}`} variant="ghost" size="sm">
          Hablar con Laura
        </ButtonLink>
      }
      padding="18px"
    >
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: crmTheme.laura.textMuted,
        }}
      >
        Laura interpreta tu mensaje y genera bloques editables para confirmar directamente en el CRM.
      </p>
    </SectionCard>
  );
}
