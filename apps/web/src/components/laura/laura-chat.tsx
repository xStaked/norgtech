"use client";

import { useState } from "react";
import { LauraAgendaCard } from "@/components/laura/laura-agenda-card";
import { LauraChatHeader } from "@/components/laura/laura-chat-header";
import { LauraComposer } from "@/components/laura/laura-composer";
import { LauraMessageList } from "@/components/laura/laura-message-list";
import { LauraDataCard } from "@/components/laura/laura-data-card";
import { LauraProposalCard } from "@/components/laura/laura-proposal-card";
import { crmTheme } from "@/components/ui/theme";
import { apiFetchClient } from "@/lib/api.client";
import { getSessionTokenClient } from "@/lib/auth";
import type {
  LauraAgendaItem,
  LauraAssistantResponse,
  LauraDraftProposal,
  LauraMessageItem,
  LauraMessageStatus,
  LauraProposalConfirmationResponse,
  LauraProposalPayload,
  LauraSessionResponse,
} from "./laura-types";

const NEXT_PUBLIC_USE_LAURO_STREAMING = process.env.NEXT_PUBLIC_USE_LAURO_STREAMING === "true";
const LAURA_API_URL = process.env.NEXT_PUBLIC_LAURA_API_URL ?? "http://localhost:8000";

interface LauraChatInitialContext {
  contextType: "customer" | "opportunity";
  contextEntityId: string;
  contextLabel?: string | null;
}

function createClientMessage(content: string): LauraMessageItem {
  return {
    id: `user-${crypto.randomUUID()}`,
    role: "user",
    kind: "report",
    content,
    createdAt: new Date().toISOString(),
  };
}

function createAssistantMessage(content: string, kind: string): LauraMessageItem {
  return {
    id: `assistant-${crypto.randomUUID()}`,
    role: "assistant",
    kind,
    content,
    createdAt: new Date().toISOString(),
  };
}

function mapSessionMessages(session: LauraSessionResponse): LauraMessageItem[] {
  return session.messages.map((message) => ({
    id: message.id,
    role:
      message.role === "assistant" || message.role === "system" ? message.role : "user",
    kind: message.kind,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

function extractDraftProposal(session: LauraSessionResponse): LauraDraftProposal | null {
  const latestProposal = [...session.proposals].reverse().find((proposal) => proposal.status !== "discarded");
  if (!latestProposal) return null;

  return {
    proposalId: latestProposal.id,
    proposal: latestProposal.payload as LauraProposalPayload,
    status: latestProposal.status,
  };
}

async function fetchLauraStream(
  sessionId: string | null,
  content: string,
  contextType?: string,
  contextEntityId?: string,
): Promise<LauraAssistantResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const token = getSessionTokenClient();

  const response = await fetch(`${LAURA_API_URL}/messages/stream`, {
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
  let result: LauraAssistantResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6)) as { event?: string; node?: string; mode?: string; sessionId?: string; message?: string } & LauraAssistantResponse;
          if (parsed.event === "result" || parsed.mode) {
            result = parsed as LauraAssistantResponse;
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

export function LauraChat({
  initialContext,
}: {
  initialContext?: LauraChatInitialContext | null;
}) {
  const [messages, setMessages] = useState<LauraMessageItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftProposal, setDraftProposal] = useState<LauraDraftProposal | null>(null);
  const [agendaItems, setAgendaItems] = useState<LauraAgendaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<LauraProposalConfirmationResponse | null>(null);
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
      `${LAURA_API_URL}/sessions/${nextSessionId}?includeMessages=true&includeProposals=true`,
    );

    if (!response.ok) {
      return;
    }

    const session = (await response.json()) as LauraSessionResponse;
    setMessages(mapSessionMessages(session));
    setDraftProposal((current) => extractDraftProposal(session) ?? current);
  }

  async function handleSend(content: string) {
    const clientMessage = createClientMessage(content);
    (clientMessage as typeof clientMessage & { status: LauraMessageStatus }).status = "pending";

    setBusy(true);
    setError(null);
    setNotice(null);
    setConfirmation(null);
    setClarificationOptions(null);
    setQueryData(null);
    setMessages((current) => [...current, clientMessage]);

    try {
      let body: LauraAssistantResponse;

      if (NEXT_PUBLIC_USE_LAURO_STREAMING) {
        body = await fetchLauraStream(
          sessionId,
          content,
          sessionId ? undefined : initialContext?.contextType,
          sessionId ? undefined : initialContext?.contextEntityId,
        );
      } else {
        const response = await apiFetchClient(`${LAURA_API_URL}/messages`, {
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

        body = (await response.json()) as LauraAssistantResponse;
      }
      setSessionId(body.sessionId);
      setMessages((current) =>
        current.map((message) =>
          message.id === clientMessage.id
            ? { ...message, status: "confirmed" as LauraMessageStatus }
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
            ? { ...message, status: "error" as LauraMessageStatus }
            : message,
        ),
      );
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Laura no pudo procesar el mensaje.",
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
        `${LAURA_API_URL}/proposals/${draftProposal.proposalId}/confirm`,
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

      const body = (await response.json()) as LauraProposalConfirmationResponse;
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
        `Laura guardó ${body.saved.length} bloques y descartó ${body.discarded.length}.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Laura no pudo confirmar la propuesta.",
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
    <div style={{ display: "grid", gap: 0 }}>
      <LauraChatHeader hasActiveSession={!!sessionId} />

      {/* Context Banner */}
      {initialContext && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: crmTheme.radius.md,
            background: crmTheme.laura.soft,
            border: `1px solid ${crmTheme.laura.border}`,
            color: crmTheme.laura.primary,
            fontSize: 13,
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          Contexto: <strong>{initialContext.contextLabel ?? initialContext.contextEntityId}</strong>
        </div>
      )}

      {/* Notice Banner */}
      {notice && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: crmTheme.radius.md,
            background: "rgba(34,197,94,0.08)",
            borderLeft: `3px solid #22c55e`,
            color: crmTheme.colors.success,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {notice}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: crmTheme.radius.md,
            background: "rgba(220,38,38,0.08)",
            borderLeft: `3px solid #dc2626`,
            color: crmTheme.colors.danger,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Message List */}
      <LauraMessageList
        messages={messages}
        busy={busy}
        onRetry={handleRetry}
        onSend={handleSend}
      />

      {/* Clarification Options */}
      {clarificationOptions && clarificationOptions.options && clarificationOptions.options.length > 0 && (
        <div style={{ display: "grid", gap: 8, padding: "8px 0" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
            Selecciona una opción:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {clarificationOptions.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={busy}
                onClick={() => handleSend(option.label)}
                style={{
                  appearance: "none",
                  border: `1px solid ${crmTheme.laura.border}`,
                  borderRadius: crmTheme.radius.md,
                  padding: "8px 16px",
                  background: crmTheme.laura.soft,
                  color: crmTheme.laura.primary,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!busy) {
                    e.currentTarget.style.background = crmTheme.colors.surface;
                    e.currentTarget.style.borderColor = crmTheme.laura.primary;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = crmTheme.laura.soft;
                  e.currentTarget.style.borderColor = crmTheme.laura.border;
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Agenda */}
      {agendaItems.length > 0 && (
        <div style={{ padding: "8px 0" }}>
          <LauraAgendaCard items={agendaItems} />
        </div>
      )}

      {/* Query Data Card */}
      {queryData && (
        <div style={{ padding: "8px 0" }}>
          <LauraDataCard
            entityType={queryData.entityType}
            action={queryData.action}
            data={queryData.data}
            summary={queryData.summary}
          />
        </div>
      )}

      {/* Inline Proposal Card */}
      {draftProposal && (
        <div style={{ padding: "12px 0" }}>
          <LauraProposalCard
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

      {/* Sticky Composer */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          paddingTop: 16,
          paddingBottom: 8,
          background: "linear-gradient(180deg, rgba(248,246,255,0) 0%, rgba(248,246,255,0.94) 18%, rgba(248,246,255,1) 100%)",
        }}
      >
        <LauraComposer disabled={busy || confirming} onSubmit={handleSend} />
      </div>
    </div>
  );
}
