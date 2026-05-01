"use client";

import { ButtonLink } from "@/components/ui/button-link";
import { SectionCard } from "@/components/ui/section-card";

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
      title="Laura"
      description={`Abre la conversación con el contexto de ${contextLabel} ya sugerido, sin bloquear que luego cambies de cuenta si el reporte iba por otro lado.`}
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
          color: "#52637a",
        }}
      >
        Úsala para reportar una visita, dejar el siguiente paso sugerido o convertir una nota libre
        en seguimiento estructurado.
      </p>
    </SectionCard>
  );
}
