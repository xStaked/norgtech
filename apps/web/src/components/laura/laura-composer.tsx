"use client";

import { useState } from "react";
import { crmTheme } from "@/components/ui/theme";

export function LauraComposer({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }

    await onSubmit(trimmed);
    setValue("");
  }

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
        placeholder="Ejemplo: Visité a Acme, confirmaron interés, piden una nueva visita y debo mover la oportunidad."
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
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: crmTheme.colors.textMuted,
          }}
        >
          Laura estructura la interacción y te deja editar cada bloque antes de guardar.
        </p>
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          style={{
            appearance: "none",
            border: 0,
            borderRadius: crmTheme.radius.md,
            minHeight: 44,
            padding: "0 18px",
            background:
              disabled || value.trim().length === 0
                ? crmTheme.colors.borderStrong
                : crmTheme.colors.primary,
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 700,
            cursor: disabled || value.trim().length === 0 ? "not-allowed" : "pointer",
          }}
        >
          Enviar a Laura
        </button>
      </div>
    </form>
  );
}
