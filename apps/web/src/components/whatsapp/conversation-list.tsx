"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WhatsAppConversation } from "./whatsapp-types";

const statusLabels: Record<string, string> = {
  nuevo: "Nuevo",
  pendiente: "Pendiente",
  en_gestion: "En gestion",
  resuelto: "Resuelto",
};

const intentLabels = new Set(["pedido", "cartera", "logistica", "gasto", "reclamo", "otro"]);

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: WhatsAppConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col border-r border-border bg-background">
      <div className="border-b border-border px-3 py-2">
        <div className="text-sm font-semibold text-foreground">Conversaciones</div>
        <div className="text-xs text-muted-foreground">{conversations.length} activas</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            className={cn(
              "grid w-full gap-1 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/70",
              selectedId === conversation.id && "bg-muted",
            )}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {conversation.senderName || conversation.customer?.displayName || conversation.phone}
              </span>
              <Badge variant={conversation.status === "nuevo" ? "default" : "outline"}>
                {statusLabels[conversation.status] ?? conversation.status}
              </Badge>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {conversation.lastMessageText || "Sin mensajes"}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {latestIntent(conversation) ? (
                <Badge variant="outline">{latestIntent(conversation)}</Badge>
              ) : null}
              {conversation.assignedToUser ? (
                <Badge variant="secondary">{conversation.assignedToUser.name}</Badge>
              ) : (
                <Badge variant="outline">Sin asignar</Badge>
              )}
            </div>
            <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{conversation.customer?.displayName ?? conversation.phone}</span>
              <span className="shrink-0">{conversation.senderType}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function latestIntent(conversation: WhatsAppConversation) {
  return conversation.tags?.find((tag) => intentLabels.has(tag.label))?.label;
}
