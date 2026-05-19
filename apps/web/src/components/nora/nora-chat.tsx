"use client";

import { useState } from "react";
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

  return (
    <div className="relative flex h-full flex-col">
      {/* Scrollable Messages Area */}
      <div className="mx-auto w-full max-w-3xl flex-1 min-h-0 space-y-4 overflow-y-auto px-1 pb-4">
        {/* Context Banner */}
        {initialContext && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-nora-500/20 bg-nora-500/10 px-3.5 py-2.5 text-sm text-nora-300">
            <span className="text-muted-foreground">Contexto:</span>
            <strong>{initialContext.contextLabel ?? initialContext.contextEntityId}</strong>
          </div>
        )}

        {/* Notice Banner */}
        {notice && (
          <div className="mb-4 rounded-lg border-l-3 border-emerald-500 bg-emerald-500/10 px-3.5 py-2.5 text-sm font-semibold text-emerald-400">
            {notice}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-4 rounded-lg border-l-3 border-destructive bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">
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
            <p className="text-sm font-semibold text-muted-foreground">
              Selecciona una opción:
            </p>
            <div className="flex flex-wrap gap-2">
              {clarificationOptions.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleSend(option.label)}
                  className="rounded-lg border border-nora-500/30 bg-nora-500/10 px-4 py-2 text-sm font-semibold text-nora-300 transition-all hover:border-nora-500/60 hover:bg-nora-500/20 disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Sticky Composer */}
      <div className="shrink-0 bg-gradient-to-t from-background via-background to-transparent pt-4 pb-2">
        <div className="mx-auto w-full max-w-3xl">
          <NoraComposer disabled={busy || confirming} onSubmit={handleSend} />
        </div>
      </div>
    </div>
  );
}
