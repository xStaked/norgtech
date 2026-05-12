"use client";

import { crmTheme } from "@/components/ui/theme";
import { NoraEmptyState } from "./nora-empty-state";
import { NoraEntryCard } from "./nora-entry-card";
import { NoraTypingIndicator } from "./nora-typing-indicator";
import { NoraMessageItem } from "./nora-types";
import { useAutoScroll } from "@/hooks/use-auto-scroll";

export function NoraMessageList({
  messages,
  busy,
  onRetry,
  onSend,
}: {
  messages: NoraMessageItem[];
  busy: boolean;
  onRetry?: (content: string) => void;
  onSend: (content: string) => void;
}) {
  const scrollRef = useAutoScroll(messages.length + (busy ? 1 : 0));

  if (messages.length === 0) {
    return <NoraEmptyState onSend={onSend} />;
  }

  return (
    <div style={{ display: "grid", gap: crmTheme.spacing.chat }}>
      {messages.map((message) => (
        <NoraEntryCard key={message.id} message={message} />
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
      {busy && <NoraTypingIndicator />}
      <div ref={scrollRef} />
    </div>
  );
}
