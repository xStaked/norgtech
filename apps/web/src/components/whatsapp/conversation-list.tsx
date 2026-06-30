"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { WhatsAppConversation } from "./whatsapp-types";
import { avatarColor, conversationName, initials, timeFormatter } from "./whatsapp-ui";

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: WhatsAppConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const haystack = [
        conversationName(conversation),
        conversation.phone,
        conversation.lastMessageText ?? "",
        conversation.customer?.displayName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, query]);

  return (
    <div className="flex min-h-0 flex-col border-r border-border bg-card">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[16px] font-extrabold tracking-tight text-[#0c2c44]">
            Conversaciones
          </h2>
          <span className="rounded-md bg-[#e6f4ec] px-2 py-1 text-xs font-semibold text-[#167c4a]">
            {conversations.length} activas
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9aa3b1]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar conversación…"
            className="h-9 w-full rounded-lg border border-border bg-[#f7f9fb] pl-9 pr-3 text-sm text-[#0c2c44] placeholder:text-[#9aa3b1] focus:outline-none focus:ring-2 focus:ring-[#0f5c8a]/20"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-[#9aa3b1]">
            Sin conversaciones
          </div>
        ) : (
          filtered.map((conversation) => {
            const name = conversationName(conversation);
            const active = selectedId === conversation.id;
            const online = conversation.status !== "resuelto";
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border-l-[3px] p-2.5 text-left transition-colors",
                  active
                    ? "border-[#0f5c8a] bg-[#eef5fb]"
                    : "border-transparent hover:bg-[#f7f9fb]",
                )}
              >
                <div className="relative shrink-0">
                  <div
                    className="flex size-[42px] items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: avatarColor(name) }}
                  >
                    {initials(name)}
                  </div>
                  {online ? (
                    <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-[#25d366]" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-bold text-[#0c2c44]">
                      {name}
                    </span>
                    <span className="shrink-0 text-[11px] text-[#9aa3b1]">
                      {timeFormatter.format(new Date(conversation.updatedAt))}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-[#6b7787]">
                      {conversation.lastMessageText || "Sin mensajes"}
                    </span>
                    {conversation.status === "nuevo" ? (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-[10px] font-bold text-white">
                        1
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
