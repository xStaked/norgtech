"use client";

import { MessageSquare } from "lucide-react";

interface NoraChatHeaderProps {
  hasActiveSession: boolean;
}

export function NoraChatHeader({ hasActiveSession }: NoraChatHeaderProps) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border/50 bg-card/80 p-3.5 shadow-sm backdrop-blur-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-nora-500 to-nora-600">
        <MessageSquare className="h-4 w-4 text-white" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-bold text-foreground">Magali</div>
        <div className="text-xs text-muted-foreground">Asistente comercial</div>
      </div>
      <div className="ml-auto">
        {hasActiveSession ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Sesión activa
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            Sin sesión
          </span>
        )}
      </div>
    </div>
  );
}
