"use client";

import { MessageSquare } from "lucide-react";

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
    <div className="flex flex-col items-center gap-5 px-6 py-10">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-nora-500 to-nora-600 shadow-lg shadow-nora-500/25">
        <MessageSquare className="h-8 w-8 text-white" strokeWidth={2} />
      </div>

      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Hola, soy Nora</h3>
        <p className="mt-1 max-w-[280px] text-sm text-muted-foreground leading-relaxed">
          Tu asistente comercial. Contame qué pasó con un cliente y yo armo el registro por vos.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Probá con un ejemplo:
        </span>
        {exampleMessages.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onSend(example)}
            className="w-full rounded-lg border border-border/50 bg-card px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-all hover:border-nora-500/40 hover:bg-nora-500/5 focus:border-nora-500/40 focus:ring-2 focus:ring-nora-500/20 focus:outline-none"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
