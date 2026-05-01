"use client";

import { MessageSquare } from "lucide-react";
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
          width: "min(100%, 680px)",
          display: "grid",
          gap: 6,
          padding: "12px 16px",
          borderRadius: 16,
          border: `1px solid ${isUser ? "transparent" : crmTheme.laura.border}`,
          background: isUser
            ? "linear-gradient(135deg, #10233f 0%, #1f4875 100%)"
            : crmTheme.colors.surface,
          boxShadow: isUser ? "none" : crmTheme.laura.shadow,
          color: isUser ? "#ffffff" : crmTheme.laura.textPrimary,
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isUser && (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: crmTheme.laura.gradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <MessageSquare size={12} color="#ffffff" strokeWidth={2.5} />
              </div>
            )}
            <strong style={{ fontSize: 12, fontWeight: 700 }}>{roleCopy[message.role]}</strong>
          </div>
          <span
            style={{
              fontSize: 11,
              color: isUser ? "rgba(255, 255, 255, 0.6)" : crmTheme.laura.textSubtle,
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
