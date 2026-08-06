"use client";

import { Paperclip, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { apiFetchClient } from "@/lib/api.client";

export function ConversationComposer({
  conversationId,
  suggestedReply,
  onSent,
}: {
  conversationId: string | null;
  suggestedReply?: string | null;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function sendMessage() {
    if (!conversationId || !body.trim() || sending) return;
    setSending(true);
    try {
      const response = await apiFetchClient(`/whatsapp/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim() }),
      });
      if (response.ok) {
        setBody("");
        onSent();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="shrink-0 space-y-2.5 border-t border-border bg-[#eef1f4] p-3">
      {suggestedReply ? (
        <div className="flex items-center gap-2.5 rounded-[10px] border border-[#e3dbfb] bg-[#f3f0ff] p-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#6d4ff0] text-white">
            <Sparkles className="size-4" />
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-[#0c2c44]">
            <span className="font-semibold text-[#6d4ff0]">Magali sugiere:</span> {suggestedReply}
          </p>
          <button
            type="button"
            onClick={() => setBody(suggestedReply)}
            className="shrink-0 rounded-md bg-[#6d4ff0] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#5b3fd8]"
          >
            Usar
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-[23px] border border-border bg-card px-2 py-1.5">
        <button
          type="button"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#6b7787] hover:bg-[#f7f9fb]"
          title="Adjuntar"
        >
          <Paperclip className="size-4" />
        </button>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          rows={1}
          placeholder="Escribe un mensaje…"
          disabled={!conversationId || sending}
          className="max-h-28 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm text-[#0c2c44] placeholder:text-[#9aa3b1] focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={!conversationId || !body.trim() || sending}
          title="Enviar"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white transition-colors hover:bg-[#1eb955] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
