"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetchClient } from "@/lib/api.client";

export function ConversationComposer({
  conversationId,
  onSent,
}: {
  conversationId: string | null;
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
    <div className="border-t border-border bg-background p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Responder por WhatsApp"
          disabled={!conversationId || sending}
          className="min-h-12 resize-none"
        />
        <Button
          type="button"
          size="icon-lg"
          onClick={sendMessage}
          disabled={!conversationId || !body.trim() || sending}
          title="Enviar"
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}
