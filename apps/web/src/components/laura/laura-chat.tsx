"use client";

import { useState } from "react";
import { LauraAgendaCard } from "@/components/laura/laura-agenda-card";
import { LauraComposer } from "@/components/laura/laura-composer";
import { LauraMessageList } from "@/components/laura/laura-message-list";
import { LauraProposalCard } from "@/components/laura/laura-proposal-card";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { crmTheme } from "@/components/ui/theme";
import { apiFetchClient } from "@/lib/api.client";
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

  async function loadSession(nextSessionId: string) {
    const response = await apiFetchClient(
      `/laura/sessions/${nextSessionId}?includeMessages=true&includeProposals=true`,
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
    setMessages((current) => [...current, clientMessage]);

    try {
      const response = await apiFetchClient("/laura/messages", {
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

      const body = (await response.json()) as LauraAssistantResponse;
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

      if (body.mode === "proposal") {
        setDraftProposal({
          proposalId: body.proposalId,
          proposal: body.proposal,
          status: "draft",
        });
      } else {
        setDraftProposal(null);
      }

      if (body.mode === "agenda") {
        setAgendaItems(body.agenda.items);
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
        `/laura/proposals/${draftProposal.proposalId}/confirm`,
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
    <div
      className="laura-chat-layout"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.95fr)",
        gap: 20,
        alignItems: "start",
      }}
    >
      <SectionCard
        title="Conversación"
        description="Reporta libremente una visita, un avance comercial o pide foco de agenda. Laura conserva la sesión solo mientras esta página siga abierta."
        actions={sessionId ? <StatusBadge tone="info">Sesión activa</StatusBadge> : null}
        style={{
          minHeight: 720,
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr) auto",
          gap: 16,
        }}
      >
        <div
          style={{
            minHeight: 0,
            display: "grid",
            gap: 14,
            alignContent: "start",
          }}
        >
          {initialContext ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: crmTheme.radius.md,
                background: "rgba(45, 108, 223, 0.08)",
                color: crmTheme.colors.info,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Laura arrancará con el contexto sugerido de{" "}
              <strong>{initialContext.contextLabel ?? initialContext.contextEntityId}</strong>.
              Si tu reporte era sobre otra cuenta, igual puedes escribirlo libremente.
            </div>
          ) : null}
          {notice ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: crmTheme.radius.md,
                background: "rgba(31, 143, 95, 0.12)",
                color: crmTheme.colors.success,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {notice}
            </div>
          ) : null}
          {error ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: crmTheme.radius.md,
                background: "rgba(186, 58, 47, 0.1)",
                color: crmTheme.colors.danger,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          ) : null}
          <LauraMessageList messages={messages} busy={busy} onRetry={handleRetry} />
          {agendaItems.length > 0 && <LauraAgendaCard items={agendaItems} />}
        </div>

        <div
          style={{
            position: "sticky",
            bottom: 0,
            paddingTop: 8,
            background:
              "linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.94) 18%, rgba(255, 255, 255, 1) 100%)",
          }}
        >
          <LauraComposer disabled={busy || confirming} onSubmit={handleSend} />
        </div>
      </SectionCard>

      <div style={{ display: "grid", gap: 16 }}>
        {draftProposal ? (
          <LauraProposalCard
            proposal={draftProposal.proposal}
            confirming={confirming}
            confirmation={confirmation}
            onChange={(proposal) =>
              setDraftProposal((current) =>
                current
                  ? {
                      ...current,
                      proposal,
                    }
                  : current,
              )
            }
            onConfirm={handleConfirm}
          />
        ) : (
          <SectionCard
            title="Borrador estructurado"
            description="Cuando Laura detecte un bloque confirmable, aparecerá aquí con edición inline."
          >
            <div
              style={{
                display: "grid",
                gap: 12,
                padding: "6px 0 4px",
                color: crmTheme.colors.textMuted,
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              <p style={{ margin: 0 }}>
                Usa esta vista para validar el resumen, decidir qué guardar y ajustar campos antes
                de persistirlos.
              </p>
              <p style={{ margin: 0 }}>
                V1 conserva el `sessionId` solo en memoria. Si recargas la página, empiezas una
                sesión nueva.
              </p>
            </div>
          </SectionCard>
        )}
      </div>

      <style>{`
        @media (max-width: 1180px) {
          .laura-chat-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
