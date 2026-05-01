"use client";

import { useEffect, useState } from "react";
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
    <form
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gap: 12,
      }}
    >
      <label
        htmlFor="laura-message"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: crmTheme.colors.textSubtle,
        }}
      >
        Mensaje para Laura
      </label>
      <textarea
        id="laura-message"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={4}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          resize: "vertical",
          minHeight: 116,
          padding: "14px 16px",
          borderRadius: crmTheme.radius.lg,
          border: `1px solid ${crmTheme.colors.borderStrong}`,
          background: crmTheme.colors.surface,
          color: crmTheme.colors.text,
          font: `400 15px/1.5 ${crmTheme.typography.body}`,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {showLengthHint ? (
          <p style={{ margin: 0, fontSize: 12, color: crmTheme.colors.danger }}>
            Escribe al menos {MIN_LENGTH} caracteres
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: crmTheme.colors.textMuted }}>
            Laura estructura la interacción y te deja editar cada bloque antes de guardar.
          </p>
        )}
        <button
          type="submit"
          disabled={!canSend}
          style={{
            appearance: "none",
            border: 0,
            borderRadius: crmTheme.radius.md,
            minHeight: 44,
            padding: "0 18px",
            background: !canSend ? crmTheme.colors.borderStrong : crmTheme.colors.primary,
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 700,
            cursor: !canSend ? "not-allowed" : "pointer",
          }}
        >
          Enviar a Laura
        </button>
      </div>
    </form>
  );
}