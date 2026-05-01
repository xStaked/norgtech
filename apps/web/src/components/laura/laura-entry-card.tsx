"use client";

import { crmTheme } from "@/components/ui/theme";
import type { LauraMessageItem } from "./laura-types";

function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Ahora";
  }

  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const roleCopy: Record<LauraMessageItem["role"], string> = {
  user: "Tú",
  assistant: "Laura",
  system: "Sistema",
};

export function LauraEntryCard({ message }: { message: LauraMessageItem }) {
  const isUser = message.role === "user";

  return (
    <article
      style={{
        display: "grid",
        justifyItems: isUser ? "end" : "start",
      }}
    >
      <div
        style={{
          width: "min(100%, 720px)",
          display: "grid",
          gap: 8,
          padding: "16px 18px",
          borderRadius: isUser ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
          border: `1px solid ${isUser ? "transparent" : crmTheme.colors.border}`,
          background: isUser
            ? "linear-gradient(135deg, #10233f 0%, #1f4875 100%)"
            : crmTheme.colors.surface,
          boxShadow: crmTheme.shadow.card,
          color: isUser ? "#ffffff" : crmTheme.colors.text,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <strong style={{ fontSize: 13 }}>{roleCopy[message.role]}</strong>
          <span
            style={{
              fontSize: 12,
              color: isUser ? "rgba(255, 255, 255, 0.68)" : crmTheme.colors.textSubtle,
            }}
          >
            {formatMessageTime(message.createdAt)}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {message.content}
        </p>
      </div>
    </article>
  );
}
