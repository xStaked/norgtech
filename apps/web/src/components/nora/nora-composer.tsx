"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 5;

const QUICK_ACTIONS = [
  "¿Qué tengo pendiente hoy?",
  "Registrar una visita",
  "Crear una cotización",
  "Resumen del cliente",
];

export function NoraComposer({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="space-y-2.5">
      {/* Quick-action pills */}
      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => void onSubmit(action)}
            className="rounded-full border border-[#ece8f8] bg-card px-3 py-1.5 text-[12px] text-[#5a4bc4] transition-colors hover:bg-[#f6f4ff] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <div
          className={cn(
            "flex items-center gap-2 rounded-[24px] border border-[#ddd6f7] bg-card px-4 shadow-[0_4px_16px_rgba(109,79,240,.10)] transition-all",
            disabled && "opacity-60",
          )}
        >
          <textarea
            ref={textareaRef}
            id="nora-message"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={1}
            placeholder={disabled ? "Nora está pensando…" : "Escríbele a Nora…"}
            disabled={disabled}
            className="flex-1 resize-none bg-transparent py-3 text-[13.5px] leading-relaxed text-[#2a2540] outline-none placeholder:text-[#9a8fd0]"
            style={{ minHeight: 48, maxHeight: 200 }}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            disabled={!canSend}
            className={cn(
              "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-white transition-all duration-200",
              canSend ? "hover:opacity-90" : "cursor-not-allowed opacity-40",
            )}
            style={{ background: "linear-gradient(135deg,#6d4ff0,#9b5cf0)" }}
            aria-label="Enviar mensaje"
          >
            <Send className="h-[17px] w-[17px]" />
          </button>
        </div>
        {showLengthHint && (
          <p className="mt-1.5 px-2 text-xs text-[#b42318]">
            Escribe al menos {MIN_LENGTH} caracteres
          </p>
        )}
      </form>
    </div>
  );
}
