"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import { ConversationComposer } from "./conversation-composer";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";
import { CustomerInfoPanel } from "./customer-info-panel";
import type {
  WhatsAppConversation,
  WhatsAppConversationDetail,
  WhatsAppConversationStatus,
} from "./whatsapp-types";

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

  async function updateConversationStatus(status: WhatsAppConversationStatus) {
    if (!selectedId) return;
    const response = await apiFetchClient(`/whatsapp/conversations/${selectedId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      await refreshSelected();
    }
  }

  const activeConversation = selectedConversation ?? fallbackConversation;
  const suggestedReply =
    selectedConversation?.noraActions?.find((action) => action.output?.suggested_reply)?.output
      ?.suggested_reply ?? null;

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-[30px] items-center justify-center rounded-md bg-[#25d366] text-white">
            <MessageCircle className="size-4" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-[#0c2c44]">WhatsApp</div>
            <div className="text-xs text-[#6b7787]">Inbox operativo asistido por Nora</div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-md bg-[#e6f4ec] px-2.5 py-1 text-xs font-semibold text-[#167c4a]">
          <span className="size-2 rounded-full bg-[#25d366]" />
          Conectado
        </span>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[312px_minmax(0,1fr)_288px]">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="flex min-h-0 flex-col">
          <ConversationThread conversation={activeConversation} />
          <ConversationComposer
            conversationId={selectedId}
            suggestedReply={suggestedReply}
            onSent={refreshSelected}
          />
        </div>
        <CustomerInfoPanel
          conversation={activeConversation}
          onStatusChange={updateConversationStatus}
          onCreated={refreshSelected}
        />
      </div>
    </div>
  );
}
