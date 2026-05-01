"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

export function ObjectionsInput({
  objections,
  disabled,
  onChange,
}: {
  objections: string[];
  disabled?: boolean;
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
        borderRadius: crmTheme.radius.sm,
        border: `1px solid ${crmTheme.laura.border}`,
        background: crmTheme.laura.soft,
      }}
    >
      {objections.map((objection, index) => (
        <span
          key={`${objection}-${index}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px 2px 10px",
            borderRadius: crmTheme.radius.pill,
            background: crmTheme.laura.primary,
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 500,
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
                color: "rgba(255,255,255,0.7)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: 0,
                marginLeft: 2,
              }}
              aria-label={`Eliminar objeción: ${objection}`}
            >
              <X size={14} />
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
          color: crmTheme.laura.textPrimary,
        }}
      />
    </div>
  );
}
