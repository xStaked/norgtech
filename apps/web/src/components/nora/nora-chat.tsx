"use client";

import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import {  NoraAgendaCard } from "@/components/nora/nora-agenda-card";

import { apiFetchClient } from "@/lib/api.client";
import { getSessionTokenClient } from "@/lib/auth";
import type {
  NoraAgendaItem,
  NoraAssistantResponse,
  NoraDraftProposal,
  NoraMessageItem,
  NoraMessageStatus,
  NoraProposalConfirmationResponse,
  NoraProposalPayload,
  NoraSessionResponse,
} from "./nora-types";
// NoraChatHeader removed — header info already shown in PageHeader
import { NoraMessageList } from "./nora-message-list";
import { NoraDataCard } from "./nora-data-card";
import { NoraProposalCard } from "./nora-proposal-card";
import { NoraComposer } from "./nora-composer";

const NEXT_PUBLIC_USE_NORA_STREAMING = process.env.NEXT_PUBLIC_USE_NORA_STREAMING === "true";
const NORA_API_URL = process.env.NEXT_PUBLIC_NORA_API_URL ?? "http://localhost:8000";

interface NoraChatInitialContext {
  contextType: "customer" | "opportunity";
  contextEntityId: string;
  contextLabel?: string | null;
}

const NORA_FONT = "'Hanken Grotesk', system-ui, sans-serif";

const SUGGESTIONS = [
  "Visité a Acme, confirmaron interés y piden nueva visita",
  "Tengo pendiente llamar a Pérez sobre la propuesta",
  "¿Qué tengo pendiente hoy?",
  "El cliente Lago quiere cotización para el próximo viernes",
];

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  return `hace ${diffDay}d`;
}

function createClientMessage(content: string): NoraMessageItem {
  return {
    id: `user-${crypto.randomUUID()}`,
    role: "user",
    kind: "report",
    content,
    createdAt: new Date().toISOString(),
  };
}

function createAssistantMessage(content: string, kind: string): NoraMessageItem {
  return {
    id: `assistant-${crypto.randomUUID()}`,
    role: "assistant",
    kind,
    content,
    createdAt: new Date().toISOString(),
  };
}

function mapSessionMessages(session: NoraSessionResponse): NoraMessageItem[] {
  return session.messages.map((message) => ({
    id: message.id,
    role:
      message.role === "assistant" || message.role === "system" ? message.role : "user",
    kind: message.kind,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

function extractDraftProposal(session: NoraSessionResponse): NoraDraftProposal | null {
  const latestProposal = [...session.proposals].reverse().find((proposal) => proposal.status !== "discarded");
  if (!latestProposal) return null;

  return {
    proposalId: latestProposal.id,
    proposal: latestProposal.payload as NoraProposalPayload,
    status: latestProposal.status,
  };
}

async function fetchLauraStream(
  sessionId: string | null,
  content: string,
  contextType?: string,
  contextEntityId?: string,
): Promise<NoraAssistantResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const token = getSessionTokenClient();

  const response = await fetch(`${NORA_API_URL}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      userId: "",
      sessionId: sessionId ?? "",
      content,
      contextType,
      contextEntityId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Stream error: ${response.status}`);
  }

  const body = response.body;
  if (!body) throw new Error("No response body");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: NoraAssistantResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6)) as { event?: string; node?: string; mode?: string; sessionId?: string; message?: string } & NoraAssistantResponse;
          if (parsed.event === "result" || parsed.mode) {
            result = parsed as NoraAssistantResponse;
          }
        } catch {
          // skip non-JSON data
        }
      }
    }
  }

  if (result) return result;
  throw new Error("Laura stream finished without result");
}

export function NoraChat({
  initialContext,
}: {
  initialContext?: NoraChatInitialContext | null;
}) {
  const [messages, setMessages] = useState<NoraMessageItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftProposal, setDraftProposal] = useState<NoraDraftProposal | null>(null);
  const [agendaItems, setAgendaItems] = useState<NoraAgendaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<NoraProposalConfirmationResponse | null>(null);
  const [clarificationOptions, setClarificationOptions] = useState<{
    type: "customer" | "opportunity" | "date" | "action";
    options?: Array<{ id: string; label: string }>;
  } | null>(null);
  const [queryData, setQueryData] = useState<{
    entityType: string;
    action: "list" | "detail";
    data: unknown;
    summary: string;
  } | null>(null);

  async function loadSession(nextSessionId: string) {
    const response = await apiFetchClient(
      `${NORA_API_URL}/sessions/${nextSessionId}?includeMessages=true&includeProposals=true`,
    );

    if (!response.ok) {
      return;
    }

    const session = (await response.json()) as NoraSessionResponse;
    setMessages(mapSessionMessages(session));
    setDraftProposal((current) => extractDraftProposal(session) ?? current);
  }

  async function handleSend(content: string) {
    const clientMessage = createClientMessage(content);
    (clientMessage as typeof clientMessage & { status: NoraMessageStatus }).status = "pending";

    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmation(null);
    setClarificationOptions(null);
    setQueryData(null);
    setMessages((current) => [...current, clientMessage]);

    try {
      let body: NoraAssistantResponse;

      if (NEXT_PUBLIC_USE_NORA_STREAMING) {
        body = await fetchLauraStream(
          sessionId,
          content,
          sessionId ? undefined : initialContext?.contextType,
          sessionId ? undefined : initialContext?.contextEntityId,
        );
      } else {
        const response = await apiFetchClient(`${NORA_API_URL}/messages`, {
          method: "POST",
          body: JSON.stringify({
            sessionId: sessionId ?? undefined,
            content,
            contextType: sessionId ? undefined : initialContext?.contextType,
            contextEntityId: sessionId ? undefined : initialContext?.contextEntityId,
          }),
        });

        if (!response.ok) {
          throw new Error("Laura no pudo procesar el mensaje.");
        }

        body = (await response.json()) as NoraAssistantResponse;
      }
      setSessionId(body.sessionId);
      setMessages((current) =>
        current.map((message) =>
          message.id === clientMessage.id
            ? { ...message, status: "confirmed" as NoraMessageStatus }
            : message,
        ),
      );
      setMessages((current) => [
        ...current,
        createAssistantMessage(body.message, body.mode),
      ]);

      if (body.mode === "proposal" || body.mode === "modify") {
        setDraftProposal({
          proposalId: body.proposalId,
          proposal: body.proposal,
          status: "draft",
        });
      } else if (body.mode === "confirm") {
        setDraftProposal(null);
        setNotice(body.message);
      } else if (body.mode === "discard") {
        setDraftProposal(null);
      } else {
        setDraftProposal(null);
      }

      if (body.mode === "agenda") {
        setAgendaItems(body.agenda.items);
      } else {
        setAgendaItems([]);
      }

      if (body.mode === "clarification") {
        setClarificationOptions(body.clarification);
      } else {
        setClarificationOptions(null);
      }

      if (body.mode === "query" && body.data) {
        setQueryData(body.data);
      } else {
        setQueryData(null);
      }

      await loadSession(body.sessionId);
    } catch (caughtError) {
      setMessages((current) =>
        current.map((message) =>
          message.id === clientMessage.id
            ? { ...message, status: "error" as NoraMessageStatus }
            : message,
        ),
      );
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nora no pudo procesar el mensaje.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!draftProposal) return;

    setConfirming(true);
    setError(null);
    setNotice(null);

    try {
      const response = await apiFetchClient(
        `${NORA_API_URL}/proposals/${draftProposal.proposalId}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            proposal: draftProposal.proposal,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Laura no pudo confirmar la propuesta.");
      }

      const body = (await response.json()) as NoraProposalConfirmationResponse;
      setConfirmation(body);
      setDraftProposal({
        proposalId: body.proposalId,
        proposal: body.proposal,
        status: body.status,
      });

      if (sessionId) {
        await loadSession(sessionId);
      }

      setNotice(
        `Nora guardó ${body.saved.length} bloques y descartó ${body.discarded.length}.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nora no pudo confirmar la propuesta.",
      );
    } finally {
      setConfirming(false);
    }
  }

  function handleRetry(content: string) {
    setMessages((current) => current.filter((m) => m.status !== "error"));
    void handleSend(content);
  }

  function handleNewConversation() {
    setMessages([]);
    setSessionId(null);
    setDraftProposal(null);
    setAgendaItems([]);
    setConfirmation(null);
    setClarificationOptions(null);
    setQueryData(null);
    setNotice(null);
    setError(null);
  }

  const firstUserMessage = messages.find((message) => message.role === "user");
  const conversationTitle = firstUserMessage?.content ?? "Conversación con Nora";
  const conversationTime = firstUserMessage
    ? formatRelativeTime(firstUserMessage.createdAt)
    : "";

  const hasConversation = messages.length > 0;

  return (
    <div className="flex h-full min-h-0" style={{ fontFamily: NORA_FONT }}>
      {/* Left rail */}
      <aside className="flex w-[262px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-[#ece8f8] bg-card p-4">
        {/* Brand header */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "linear-gradient(135deg,#6d4ff0,#9b5cf0)" }}
          >
            <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-extrabold leading-tight text-[#2a1f6e]">
              Nora
            </p>
            <p className="truncate text-[11px] text-[#9a8fd0]">
              Asistente comercial IA
            </p>
          </div>
        </div>

        {/* New conversation */}
        <button
          type="button"
          onClick={handleNewConversation}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#6d4ff0,#9b5cf0)" }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nueva conversación
        </button>

        {/* Conversations */}
        <div className="space-y-1.5">
          <p className="px-1 text-[10.5px] font-bold uppercase tracking-wider text-[#b3add0]">
            Conversaciones
          </p>
          {hasConversation ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f3f0ff] p-2 text-[#3a2a8c]">
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                {conversationTitle}
              </span>
              {conversationTime && (
                <span className="shrink-0 text-[11px] text-[#b3add0]">
                  {conversationTime}
                </span>
              )}
            </div>
          ) : (
            <p className="px-1 text-[12px] text-[#b3add0]">
              Aún no hay conversaciones.
            </p>
          )}
        </div>

        {/* Suggestions */}
        <div className="space-y-1.5">
          <p className="px-1 text-[10.5px] font-bold uppercase tracking-wider text-[#b3add0]">
            Sugerencias
          </p>
          <div className="space-y-1.5">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy || confirming}
                onClick={() => handleSend(suggestion)}
                className="flex w-full items-center gap-2 rounded-lg border border-[#ece8f8] p-2 text-left text-[12px] text-[#4a4470] transition-colors hover:bg-[#f6f4ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#9b5cf0]" />
                <span className="min-w-0 flex-1">{suggestion}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right chat area */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#faf9ff]">
        {/* Thread header */}
        <div className="flex h-14 shrink-0 flex-col justify-center border-b border-[#ece8f8] bg-card px-5">
          <p className="truncate text-[15px] font-extrabold text-[#2a2540]">
            {hasConversation ? conversationTitle : "Nueva conversación"}
          </p>
          <p className="truncate text-[12px] text-[#9a8fd0]">
            {initialContext
              ? `Contexto: ${initialContext.contextLabel ?? initialContext.contextEntityId}`
              : "Asistente comercial IA"}
          </p>
        </div>

        {/* Scrollable messages */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {/* Notice Banner */}
          {notice && (
            <div className="rounded-[11px] border-l-[3px] border-[#167c4a] bg-[#167c4a]/10 px-3.5 py-2.5 text-[13px] font-semibold text-[#167c4a]">
              {notice}
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="rounded-[11px] border-l-[3px] border-[#b42318] bg-[#b42318]/10 px-3.5 py-2.5 text-[13px] font-semibold text-[#b42318]">
              {error}
            </div>
          )}

          {/* Message List */}
          <NoraMessageList
            messages={messages}
            busy={busy}
            onRetry={handleRetry}
            onSend={handleSend}
          />

          {/* Clarification Options */}
          {clarificationOptions && clarificationOptions.options && clarificationOptions.options.length > 0 && (
            <div className="space-y-2 py-2">
              <p className="text-[13px] font-semibold text-[#4a4470]">
                Selecciona una opción:
              </p>
              <div className="flex flex-wrap gap-2">
                {clarificationOptions.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={busy}
                    onClick={() => handleSend(option.label)}
                    className="rounded-full border border-[#ddd6f7] bg-card px-4 py-2 text-[13px] font-semibold text-[#5a4bc4] transition-colors hover:bg-[#f6f4ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Agenda */}
          {agendaItems.length > 0 && (
            <div className="py-2">
              <NoraAgendaCard items={agendaItems} />
            </div>
          )}

          {/* Query Data Card */}
          {queryData && (
            <div className="py-2">
              <NoraDataCard
                entityType={queryData.entityType}
                action={queryData.action}
                data={queryData.data}
                summary={queryData.summary}
              />
            </div>
          )}

          {/* Inline Proposal Card */}
          {draftProposal && (
            <div className="py-3">
              <NoraProposalCard
                proposal={draftProposal.proposal}
                confirming={confirming}
                confirmation={confirmation}
                onChange={(proposal) =>
                  setDraftProposal((current) =>
                    current ? { ...current, proposal } : current
                  )
                }
                onConfirm={handleConfirm}
              />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 px-6 pb-5">
          <NoraComposer disabled={busy || confirming} onSubmit={handleSend} />
        </div>
      </div>
    </div>
  );
}
