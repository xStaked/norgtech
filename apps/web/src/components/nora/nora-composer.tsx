"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 5;

const placeholderExamples = [
  "Visité a Acme, confirmaron interés y piden nueva visita…",
  "Tengo pendiente llamar a Pérez sobre la propuesta…",
  "¿Qué tengo pendiente hoy?",
  "El cliente Lago quiere cotización para el próximo viernes…",
  "Reunión con Distribuidora Norte, quieren cerrar esta semana…",
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPlaceholder(placeholderExamples[Math.floor(Math.random() * placeholderExamples.length)]);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 48), 200);
    textarea.style.height = `${newHeight}px`;
  }, [value]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < MIN_LENGTH || disabled) return;
    await onSubmit(trimmed);
    setValue("");
    // Reset height after clearing and refocus
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = "48px";
      textareaRef.current.focus();
    }
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
      <div
        className={cn(
          "group flex items-end gap-2 rounded-[1.25rem] border px-4 py-3 shadow-sm transition-all",
          disabled
            ? "border-border/20 bg-muted/30 opacity-60"
            : "border-border/40 bg-card/80 shadow-black/5 backdrop-blur-xl focus-within:border-nora-500/40 focus-within:bg-background focus-within:shadow-md focus-within:shadow-nora-500/10 focus-within:ring-1 focus-within:ring-nora-500/15"
        )}
      >
        <textarea
          ref={textareaRef}
          id="nora-message"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={1}
          placeholder={disabled ? "Nora está pensando…" : placeholder}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
          style={{ minHeight: 48, maxHeight: 200 }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200",
            canSend
              ? "bg-gradient-to-br from-nora-500 to-nora-600 text-white shadow-lg shadow-nora-500/30 hover:scale-110 hover:shadow-nora-500/50"
              : "cursor-not-allowed text-muted-foreground/20"
          )}
          aria-label="Enviar mensaje"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </div>
      {showLengthHint && (
        <p className="mt-1.5 px-2 text-xs text-destructive">
          Escribe al menos {MIN_LENGTH} caracteres
        </p>
      )}
    </form>
  );
}
