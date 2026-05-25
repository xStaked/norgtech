"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WhatsAppConversationDetail } from "./whatsapp-types";

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function ConversationThread({
  conversation,
}: {
  conversation: WhatsAppConversationDetail | null;
}) {
  if (!conversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Selecciona una conversación
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">
            {conversation.senderName || conversation.customer?.displayName || conversation.phone}
          </h2>
          <Badge variant="outline">{conversation.senderType}</Badge>
          <Badge variant={conversation.status === "nuevo" ? "default" : "secondary"}>
            {conversation.status}
          </Badge>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {conversation.customer?.displayName ?? "Cliente sin vincular"} · {conversation.phone}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
        {conversation.messages.map((message) => {
          const outbound = message.direction === "outbound";
          return (
            <div
              key={message.id}
              className={cn("flex", outbound ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[78%] rounded-lg border px-3 py-2 text-sm shadow-sm",
                  outbound
                    ? "border-primary/20 bg-primary text-primary-foreground"
                    : "border-border bg-muted text-foreground",
                )}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{message.body}</div>
                <div
                  className={cn(
                    "mt-1 text-[11px]",
                    outbound ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {dateTimeFormatter.format(new Date(message.createdAt))}
                  {message.deliveryStatus ? ` · ${message.deliveryStatus}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
