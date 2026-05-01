"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

const MIN_LENGTH = 5;

const placeholderExamples = [
  "Ejemplo: Visité a Acme, confirmaron interés y piden nueva visita",
  "Ejemplo: Tengo pendiente llamar a Pérez sobre la propuesta",
  "Ejemplo: Qué tengo pendiente hoy?",
  "Ejemplo: El cliente Lago quiere cotización para el próximo viernes",
  "Ejemplo: Reunión con Distribuidora Norte, quieren cerrar esta semana",
];

export function LauraComposer({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState(placeholderExamples[0]);

  useEffect(() => {
    setPlaceholder(placeholderExamples[Math.floor(Math.random() * placeholderExamples.length)]);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || trimmed.length < MIN_LENGTH || disabled) {
      return;
    }

    await onSubmit(trimmed);
    setValue("");
  }

  const canSend = !disabled && value.trim().length >= MIN_LENGTH;
  const showLengthHint = value.trim().length > 0 && value.trim().length < MIN_LENGTH;

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <textarea
          id="laura-message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={3}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            resize: "none",
            minHeight: 48,
            maxHeight: 120,
            padding: "12px 14px",
            borderRadius: crmTheme.radius.md,
            border: `1px solid ${crmTheme.laura.border}`,
            background: crmTheme.colors.surface,
            color: crmTheme.laura.textPrimary,
            font: `400 15px/1.5 ${crmTheme.typography.body}`,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = crmTheme.laura.primary;
            e.currentTarget.style.boxShadow = crmTheme.laura.focusRing;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = crmTheme.laura.border;
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          style={{
            appearance: "none",
            border: 0,
            borderRadius: crmTheme.radius.md,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: canSend ? crmTheme.laura.gradient : "#d4d2e8",
            color: "#ffffff",
            cursor: canSend ? "pointer" : "not-allowed",
            transition: "background 0.15s ease",
            flexShrink: 0,
          }}
        >
          <Send size={18} />
        </button>
      </div>
      {showLengthHint && (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: crmTheme.colors.danger }}>
          Escribe al menos {MIN_LENGTH} caracteres
        </p>
      )}
    </form>
  );
}
