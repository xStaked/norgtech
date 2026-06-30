"use client";

import { CheckCheck, MoreVertical, Phone } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { WhatsAppConversationDetail } from "./whatsapp-types";
import {
  avatarColor,
  conversationName,
  initials,
  senderTypeLabel,
  timeFormatter,
} from "./whatsapp-ui";

export function ConversationThread({
  conversation,
}: {
  conversation: WhatsAppConversationDetail | null;
}) {
  if (!conversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#eef1f4] text-sm text-[#6b7787]">
        Selecciona una conversación
      </div>
    );
  }

  const name = conversationName(conversation);
  const presence =
    conversation.customer?.displayName ?? conversation.phone;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#eef1f4]">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: avatarColor(name) }}
          >
            {initials(name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[14.5px] font-extrabold text-[#0c2c44]">{name}</h2>
              <span className="shrink-0 rounded-md bg-[#e6f0f6] px-2 py-0.5 text-[11px] font-semibold text-[#0f5c8a]">
                {senderTypeLabel(conversation.senderType)}
              </span>
            </div>
            <div className="truncate text-xs text-[#167c4a]">{presence}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {conversation.customer?.id ? (
            <Link
              href={`/customers/${conversation.customer.id}`}
              className="text-xs font-semibold text-[#0f5c8a] hover:underline"
            >
              Ver cliente →
            </Link>
          ) : null}
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-[#6b7787] hover:bg-[#f7f9fb]"
            title="Llamar"
          >
            <Phone className="size-4" />
          </button>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-[#6b7787] hover:bg-[#f7f9fb]"
            title="Más opciones"
          >
            <MoreVertical className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-5">
        {conversation.messages.length === 0 ? (
          <div className="m-auto text-sm text-[#6b7787]">Sin mensajes todavía</div>
        ) : (
          <>
            <div className="mx-auto rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-[#6b7787] shadow-sm">
              Hoy
            </div>
            {conversation.messages.map((message) => {
              const outbound = message.direction === "outbound";
              return (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[62%] p-2 text-sm shadow-sm",
                    outbound
                      ? "self-end rounded-[12px_2px_12px_12px] bg-[#d9fdd3] text-[#0c2c44]"
                      : "self-start rounded-[2px_12px_12px_12px] bg-white text-[#0c2c44]",
                  )}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{message.body}</div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#9aa3b1]">
                    <span>{timeFormatter.format(new Date(message.createdAt))}</span>
                    {outbound ? <CheckCheck className="size-3.5 text-[#34b7f1]" /> : null}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
