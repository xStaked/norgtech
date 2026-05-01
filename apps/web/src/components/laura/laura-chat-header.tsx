"use client";

import { MessageSquare } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

interface LauraChatHeaderProps {
  hasActiveSession: boolean;
}

export function LauraChatHeader({ hasActiveSession }: LauraChatHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: crmTheme.colors.surface,
        borderRadius: crmTheme.radius.lg,
        border: `1px solid ${crmTheme.colors.border}`,
        boxShadow: crmTheme.shadow.card,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: crmTheme.laura.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MessageSquare size={18} color="#ffffff" strokeWidth={2} />
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
          Laura
        </span>
        <span style={{ fontSize: 12, color: crmTheme.laura.textMuted }}>
          Asistente comercial
        </span>
      </div>
      <div style={{ marginLeft: "auto" }}>
        {hasActiveSession ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: crmTheme.colors.success,
              background: "rgba(31, 143, 95, 0.08)",
              padding: "4px 10px",
              borderRadius: crmTheme.radius.pill,
            }}
          >
            <span
              className="laura-session-dot"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: crmTheme.colors.success,
                animation: "lauraPulse 2s infinite",
              }}
            />
            Sesión activa
          </span>
        ) : (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: crmTheme.colors.textMuted,
              background: crmTheme.colors.surfaceMuted,
              padding: "4px 10px",
              borderRadius: crmTheme.radius.pill,
            }}
          >
            Sin sesión
          </span>
        )}
      </div>
    </div>
  );
}
