"use client";

import { MessageSquare } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

const exampleMessages = [
  "Visité a Acme, confirmaron interés y piden nueva visita",
  "Tengo pendiente llamar a Pérez sobre la propuesta",
  "¿Qué tengo pendiente hoy?",
];

interface NoraEmptyStateProps {
  onSend: (message: string) => void;
}

export function NoraEmptyState({ onSend }: NoraEmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: crmTheme.nora.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: crmTheme.nora.shadowFloating,
        }}
      >
        <MessageSquare size={32} color="#ffffff" strokeWidth={2} />
      </div>

      <div style={{ textAlign: "center" }}>
        <h3
          style={{
            margin: "0 0 4px",
            fontSize: 20,
            fontWeight: 700,
            color: crmTheme.nora.textPrimary,
          }}
        >
          Hola, soy Laura
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: crmTheme.nora.textMuted,
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          Tu asistente comercial. Contame qué pasó con un cliente y yo armo el registro por vos.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 360, display: "grid", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: crmTheme.nora.textSubtle,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Probá con un ejemplo:
        </span>
        {exampleMessages.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onSend(example)}
            style={{
              padding: "10px 14px",
              background: crmTheme.colors.surface,
              border: `1px solid ${crmTheme.nora.border}`,
              borderRadius: crmTheme.radius.md,
              textAlign: "left",
              fontSize: 13,
              color: crmTheme.nora.textMuted,
              cursor: "pointer",
              transition: "border-color 0.15s ease, background 0.15s ease",
              fontFamily: crmTheme.typography.body,
              lineHeight: 1.4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = crmTheme.nora.primary;
              e.currentTarget.style.background = crmTheme.nora.surface;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = crmTheme.nora.border;
              e.currentTarget.style.background = crmTheme.colors.surface;
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = crmTheme.nora.primary;
              e.currentTarget.style.boxShadow = crmTheme.nora.focusRing;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = crmTheme.nora.border;
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
