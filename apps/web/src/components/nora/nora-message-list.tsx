"use client";

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
    <div className="space-y-3">
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
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/20"
          >
            Reintentar
          </button>
        ))}
      {busy && <NoraTypingIndicator />}
      <div ref={scrollRef} />
    </div>
  );
}
