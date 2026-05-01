"use client";

import { crmTheme } from "@/components/ui/theme";

export function LauraTypingIndicator() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: "20px 20px 20px 6px",
        background: crmTheme.colors.surface,
        border: `1px solid ${crmTheme.laura.border}`,
        color: crmTheme.colors.textMuted,
        fontSize: 13,
        fontWeight: 600,
        width: "fit-content",
      }}
    >
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span
          className="laura-typing-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: crmTheme.laura.primary,
            animation: "lauraBounce 1.4s infinite",
          }}
        />
        <span
          className="laura-typing-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: crmTheme.laura.primary,
            animation: "lauraBounce 1.4s infinite",
            animationDelay: "0.2s",
          }}
        />
        <span
          className="laura-typing-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: crmTheme.laura.primary,
            animation: "lauraBounce 1.4s infinite",
            animationDelay: "0.4s",
          }}
        />
      </div>
      Laura está procesando
    </div>
  );
}
