"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";
import {
  decodeJwtPayload,
  getSessionTokenClient,
  getUserRoleFromToken,
  type UserRole,
} from "@/lib/auth";
import { ConversationComposer } from "./conversation-composer";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";
import { CustomerInfoPanel } from "./customer-info-panel";
import type {
  WhatsAppConversation,
  WhatsAppConversationDetail,
  WhatsAppConversationStatus,
} from "./whatsapp-types";
import { UNICANAL_AGENT_ROLE_SET } from "./whatsapp-ui";

export function WhatsAppInbox({
  initialConversations,
  initialConversationId,
}: {
  initialConversations: WhatsAppConversation[];
  /** Conversación a abrir de entrada, aunque no venga en la primera página. */
  initialConversationId?: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversationId ?? initialConversations[0]?.id ?? null,
  );
  const [selectedConversation, setSelectedConversation] =
    useState<WhatsAppConversationDetail | null>(null);

  const token = getSessionTokenClient();
  const role = getUserRoleFromToken(token);
  const isAgent = role != null && UNICANAL_AGENT_ROLE_SET.has(role);
  // Los unicos roles que no atienden son los supervisores (administrador,
  // director_comercial): no hay tercera categoria.
  const isSupervisor = role != null && !isAgent;
  const myUserId = token ? ((decodeJwtPayload(token)?.sub as string | undefined) ?? null) : null;

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
    void loadConversation(selectedId);
    if (!selectedId) return;
    // ponytail: poll de 4s sobre la conversación abierta en vez de websocket.
    // Es una sola query con includes y solo corre para la pestaña que la mira;
    // si hace falta latencia sub-segundo o hay muchos agentes, pasar a SSE.
    const id = setInterval(() => {
      void loadConversation(selectedId);
    }, 4000);
    return () => clearInterval(id);
  }, [selectedId]);

  useEffect(() => {
    const id = setInterval(() => {
      void refreshList();
    }, 10000);
    return () => clearInterval(id);
  }, []);

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

  async function reassignRole(assignedToRole: UserRole) {
    if (!selectedId) return;
    const response = await apiFetchClient(`/whatsapp/conversations/${selectedId}`, {
      method: "PATCH",
      body: JSON.stringify({ assignedToRole }),
    });
    if (!response.ok) return;
    // Un agente que la manda a otra area la pierde de vista (el API responde 403
    // al volver a leerla): soltamos la seleccion en vez de pedirla de nuevo.
    if (!isSupervisor && assignedToRole !== role) {
      setSelectedId(null);
      setSelectedConversation(null);
      await refreshList();
      return;
    }
    await refreshSelected();
  }

  async function claimConversation(id: string) {
    const response = await apiFetchClient(`/whatsapp/conversations/${id}/claim`, {
      method: "POST",
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
          {isAgent && activeConversation && !activeConversation.assignedToUser ? (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-[#fff7e6] px-4 py-2.5">
              <span className="text-xs font-medium text-[#8a6d1f]">
                Sin asignar — tomala para responder.
              </span>
              <button
                type="button"
                onClick={() => activeConversation && claimConversation(activeConversation.id)}
                className="rounded-md bg-[#0f5c8a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0c4a70]"
              >
                Tomar conversación
              </button>
            </div>
          ) : null}
          <ConversationComposer
            conversationId={selectedId}
            suggestedReply={suggestedReply}
            onSent={refreshSelected}
          />
        </div>
        <CustomerInfoPanel
          conversation={activeConversation}
          onStatusChange={updateConversationStatus}
          onRoleChange={reassignRole}
          canReassign={
            isSupervisor ||
            (myUserId != null && activeConversation?.assignedToUser?.id === myUserId)
          }
          onCreated={refreshSelected}
        />
      </div>
    </div>
  );
}
