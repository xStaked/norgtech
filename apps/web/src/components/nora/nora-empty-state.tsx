"use client";

import { Sparkles } from "lucide-react";

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
    <div className="flex flex-col items-center gap-6 px-6 py-10">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-[0_8px_24px_rgba(109,79,240,.25)]"
        style={{ background: "linear-gradient(135deg,#6d4ff0,#9b5cf0)" }}
      >
        <Sparkles className="h-8 w-8 text-white" strokeWidth={2} />
      </div>

      <div className="text-center">
        <h3 className="text-xl font-extrabold text-[#2a1f6e]">Hola, soy Magali</h3>
        <p className="mt-1.5 max-w-[280px] text-sm leading-relaxed text-[#9a8fd0]">
          Tu asistente comercial. Contame qué pasó con un cliente y yo armo el registro por vos.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#b3add0]">
          Probá con un ejemplo:
        </span>
        {exampleMessages.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onSend(example)}
            className="flex w-full items-center gap-2 rounded-xl border border-[#ece8f8] bg-card px-4 py-3 text-left text-sm text-[#4a4470] transition-colors hover:bg-[#f6f4ff] focus:outline-none focus:ring-2 focus:ring-[#ddd6f7]"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-[#9b5cf0]" />
            <span className="min-w-0 flex-1">{example}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
