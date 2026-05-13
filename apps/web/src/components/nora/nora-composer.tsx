"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 5;

const placeholderExamples = [
  "Ejemplo: Visité a Acme, confirmaron interés y piden nueva visita",
  "Ejemplo: Tengo pendiente llamar a Pérez sobre la propuesta",
  "Ejemplo: Qué tengo pendiente hoy?",
  "Ejemplo: El cliente Lago quiere cotización para el próximo viernes",
  "Ejemplo: Reunión con Distribuidora Norte, quieren cerrar esta semana",
];

export function NoraComposer({
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
    if (!trimmed || trimmed.length < MIN_LENGTH || disabled) return;
    await onSubmit(trimmed);
    setValue("");
  }

  const canSend = !disabled && value.trim().length >= MIN_LENGTH;
  const showLengthHint = value.trim().length > 0 && value.trim().length < MIN_LENGTH;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex items-end gap-2.5">
        <div className="relative flex-1">
          <textarea
            id="nora-message"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full resize-none rounded-xl border border-border/60 bg-muted/50 px-4 py-3 text-[15px] leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-nora-500/50 focus:bg-background focus:ring-2 focus:ring-nora-500/20 disabled:opacity-50"
            style={{ minHeight: 56, maxHeight: 140 }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            canSend
              ? "bg-gradient-to-br from-nora-500 to-nora-600 text-white shadow-lg shadow-nora-500/25 hover:scale-105 hover:shadow-nora-500/40"
              : "cursor-not-allowed bg-muted text-muted-foreground/40"
          )}
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </div>
      {showLengthHint && (
        <p className="mt-1.5 text-xs text-destructive">
          Escribe al menos {MIN_LENGTH} caracteres
        </p>
      )}
    </form>
  );
}
