"use client";

import { crmTheme } from "@/components/ui/theme";
import { EmptyState } from "@/components/ui/empty-state";
import { LauraEntryCard } from "./laura-entry-card";
import type { LauraMessageItem } from "./laura-types";
import { useAutoScroll } from "@/hooks/use-auto-scroll";

export function LauraMessageList({
  messages,
  busy,
  onRetry,
}: {
  messages: LauraMessageItem[];
  busy: boolean;
  onRetry?: (content: string) => void;
}) {
  const scrollRef = useAutoScroll(messages.length + (busy ? 1 : 0));

  if (messages.length === 0) {
    return (
      <EmptyState
        title="Empieza con un reporte libre"
        description="Cuenta lo que pasó con un cliente, una oportunidad o pregunta por tus prioridades del día. Laura devolverá una propuesta compacta para confirmar."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 14, overflowY: "auto", maxHeight: "520px" }}>
      {messages.map((message) => (
        <LauraEntryCard key={message.id} message={message} />
      ))}
      {messages
        .filter((message) => message.status === "error" && onRetry)
        .map((message) => (
          <button
            key={`retry-${message.id}`}
            type="button"
            onClick={() => onRetry!(message.content)}
            style={{
              appearance: "none",
              border: 0,
              borderRadius: crmTheme.radius.md,
              padding: "4px 12px",
              background: crmTheme.colors.danger,
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
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
      <div ref={scrollRef} />
    </div>
  );
}
