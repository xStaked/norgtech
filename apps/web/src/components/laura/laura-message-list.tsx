"use client";

import { crmTheme } from "@/components/ui/theme";
import { EmptyState } from "@/components/ui/empty-state";
import { LauraEntryCard } from "./laura-entry-card";
import type { LauraMessageItem } from "./laura-types";

export function LauraMessageList({
  messages,
  busy,
}: {
  messages: LauraMessageItem[];
  busy: boolean;
}) {
  if (messages.length === 0) {
    return (
      <EmptyState
        title="Empieza con un reporte libre"
        description="Cuenta lo que pasó con un cliente, una oportunidad o pregunta por tus prioridades del día. Laura devolverá una propuesta compacta para confirmar."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {messages.map((message) => (
        <LauraEntryCard key={message.id} message={message} />
      ))}
      {busy ? (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            width: "fit-content",
            borderRadius: crmTheme.radius.pill,
            background: crmTheme.colors.surfaceMuted,
            color: crmTheme.colors.textMuted,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span aria-hidden="true">•••</span>
          Laura está procesando tu mensaje
        </div>
      ) : null}
    </div>
  );
}
