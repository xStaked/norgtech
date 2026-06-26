"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import { ConversationComposer } from "./conversation-composer";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";
import { NoraSuggestionPanel } from "./nora-suggestion-panel";
import { OrderDraftPanel } from "./order-draft-panel";
import type { WhatsAppConversation, WhatsAppConversationDetail } from "./whatsapp-types";

export function WhatsAppInbox({
  initialConversations,
}: {
  initialConversations: WhatsAppConversation[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState(initialConversations[0]?.id ?? null);
  const [selectedConversation, setSelectedConversation] =
    useState<WhatsAppConversationDetail | null>(null);

  async function refreshList() {
    const response = await apiFetchClient("/whatsapp/conversations");
    if (response.ok) {
      setConversations(await response.json());
    }
  }

  async function loadConversation(id: string | null) {
    if (!id) {
      setSelectedConversation(null);
      return;
    }
    const response = await apiFetchClient(`/whatsapp/conversations/${id}`);
    if (response.ok) {
      setSelectedConversation(await response.json());
    }
  }

  useEffect(() => {
    loadConversation(selectedId);
  }, [selectedId]);

  const selectedSummary = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const fallbackConversation = useMemo<WhatsAppConversationDetail | null>(
    () =>
      selectedSummary
        ? {
            ...selectedSummary,
            messages: [],
            notes: [],
            noraActions: [],
            noraCases: [],
            orders: [],
          }
        : null,
    [selectedSummary],
  );

  async function refreshSelected() {
    await Promise.all([refreshList(), loadConversation(selectedId)]);
  }

  async function updateConversationStatus(
    status: "nuevo" | "pendiente" | "en_gestion" | "resuelto",
  ) {
    if (!selectedId) return;
    const response = await apiFetchClient(`/whatsapp/conversations/${selectedId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      await refreshSelected();
    }
  }

  return (
    <div className="grid min-h-[680px] overflow-hidden rounded-lg border border-border bg-background lg:grid-cols-[320px_minmax(0,1fr)_320px]">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <div className="flex min-h-0 flex-col">
        <ConversationThread conversation={selectedConversation ?? fallbackConversation} />
        <ConversationComposer conversationId={selectedId} onSent={refreshSelected} />
      </div>
      <div className="min-h-0 border-l border-border bg-background">
        <div className="border-b border-border p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Estado</div>
          <div className="grid grid-cols-2 gap-2">
            {(["pendiente", "en_gestion", "resuelto"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => updateConversationStatus(status)}
                disabled={!selectedId}
                className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        <NoraSuggestionPanel conversation={selectedConversation} />
        <OrderDraftPanel conversation={selectedConversation} onCreated={refreshSelected} />
      </div>
    </div>
  );
}
