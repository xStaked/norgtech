"use client";

import { useState } from "react";
import { crmTheme } from "@/components/ui/theme";

export function ObjectionsInput({
  objections,
  disabled,
  onChange,
}: {
  objections: string[];
  disabled: boolean;
  onChange: (objections: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && !objections.includes(trimmed)) {
        onChange([...objections, trimmed]);
        setInputValue("");
      }
    }

    if (event.key === "Backspace" && inputValue === "" && objections.length > 0) {
      onChange(objections.slice(0, -1));
    }
  }

  function handleRemove(index: number) {
    onChange(objections.filter((_, i) => i !== index));
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        minHeight: 42,
        padding: "6px 10px",
        borderRadius: crmTheme.radius.md,
        border: `1px solid ${crmTheme.colors.borderStrong}`,
        background: crmTheme.colors.surface,
      }}
    >
      {objections.map((objection, index) => (
        <span
          key={objection}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: crmTheme.radius.pill,
            background: crmTheme.colors.surfaceMuted,
            fontSize: 13,
            color: crmTheme.colors.text,
          }}
        >
          {objection}
          {!disabled && (
            <button
              type="button"
              onClick={() => handleRemove(index)}
              style={{
                appearance: "none",
                border: 0,
                background: "none",
                color: crmTheme.colors.textMuted,
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
              aria-label={`Eliminar objeción: ${objection}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={objections.length === 0 ? "Escribe y presiona Enter" : ""}
        aria-label="Agregar objeción"
        style={{
          flex: 1,
          minWidth: 80,
          border: 0,
          outline: 0,
          background: "transparent",
          font: `400 14px/1.4 ${crmTheme.typography.body}`,
          color: crmTheme.colors.text,
        }}
      />
    </div>
  );
}