"use client";

import { Badge } from "@/components/ui/badge";
import type { WhatsAppConversationDetail } from "./whatsapp-types";

export function NoraSuggestionPanel({
  conversation,
}: {
  conversation: WhatsAppConversationDetail | null;
}) {
  const latestAction = conversation?.noraActions?.[0] ?? null;
  const output = latestAction?.output ?? null;

  return (
    <div className="border-b border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">Nora</div>
        {latestAction ? <Badge variant="outline">{latestAction.status}</Badge> : null}
      </div>
      {output ? (
        <div className="space-y-2 text-sm">
          <div className="text-muted-foreground">{output.summary}</div>
          {output.suggested_reply ? (
            <div className="rounded-md border border-border bg-muted p-2 text-foreground">
              {output.suggested_reply}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {output.mode ? <Badge variant="secondary">{output.mode}</Badge> : null}
            {output.intent ? <Badge variant="secondary">{output.intent}</Badge> : null}
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          {latestAction?.error ?? "Sin sugerencia disponible"}
        </div>
      )}
    </div>
  );
}
