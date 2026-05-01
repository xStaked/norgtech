"use client";

import { crmTheme } from "@/components/ui/theme";
import { LauraEmptyState } from "./laura-empty-state";
import { LauraEntryCard } from "./laura-entry-card";
import { LauraTypingIndicator } from "./laura-typing-indicator";
import type { LauraMessageItem } from "./laura-types";
import { useAutoScroll } from "@/hooks/use-auto-scroll";

export function LauraMessageList({
  messages,
  busy,
  onRetry,
  onSend,
}: {
  messages: LauraMessageItem[];
  busy: boolean;
  onRetry?: (content: string) => void;
  onSend: (content: string) => void;
}) {
  const scrollRef = useAutoScroll(messages.length + (busy ? 1 : 0));

  if (messages.length === 0) {
    return <LauraEmptyState onSend={onSend} />;
  }

  return (
    <div style={{ display: "grid", gap: crmTheme.spacing.chat }}>
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
              border: `1px solid ${crmTheme.colors.danger}`,
              borderRadius: crmTheme.radius.md,
              padding: "6px 14px",
              background: "rgba(186, 58, 47, 0.08)",
              color: crmTheme.colors.danger,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              width: "fit-content",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Reintentar
          </button>
        ))}
      {busy && <LauraTypingIndicator />}
      <div ref={scrollRef} />
    </div>
  );
}
