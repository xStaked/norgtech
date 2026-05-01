"use client";

import { crmTheme } from "@/components/ui/theme";

export function LauraTypingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Laura está procesando tu mensaje"
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
        {[0, 0.2, 0.4].map((delay) => (
          <span
            key={delay}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: crmTheme.laura.primary,
              animation: "lauraBounce 1.4s infinite",
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>
      Laura está procesando
      <style>{`
        @keyframes lauraBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
