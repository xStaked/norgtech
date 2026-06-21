"use client";

import { Badge } from "@/components/ui/badge";
import type { NoraProposal, WhatsAppConversationDetail } from "./whatsapp-types";

type NoraSuggestionPanelProps = {
  conversation: WhatsAppConversationDetail | null;
};

const riskLabels: Record<string, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
};

export function NoraSuggestionPanel({ conversation }: NoraSuggestionPanelProps) {
  const latestAction = conversation?.noraActions?.[0] ?? null;
  const output = latestAction?.output ?? null;
  const proposals = output?.proposals ?? [];
  const automation = output?.order_automation ?? null;

  if (!conversation) {
    return (
      <div className="border-b border-border p-3">
        <div className="text-sm font-semibold">Nora</div>
        <p className="mt-1 text-sm text-muted-foreground">Selecciona una conversación.</p>
      </div>
    );
  }

  return (
    <div className="border-b border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Nora</div>
        {latestAction ? <Badge variant="secondary">{latestAction.status}</Badge> : null}
      </div>

      {!output ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {latestAction?.error ?? "Sin sugerencias todavía."}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {output.mode ? <Badge variant="outline">{output.mode}</Badge> : null}
            {output.intent ? <Badge variant="outline">{output.intent}</Badge> : null}
            {output.risk_level ? (
              <Badge variant={output.risk_level === "high" ? "destructive" : "secondary"}>
                Riesgo {riskLabels[output.risk_level] ?? output.risk_level}
              </Badge>
            ) : null}
            {output.requires_human_review ? (
              <Badge variant="secondary">Requiere revisión</Badge>
            ) : null}
          </div>

          {output.summary ? (
            <div className="rounded-md border border-border bg-muted p-2 text-sm text-foreground">
              {output.summary}
            </div>
          ) : null}

          {output.blocked_reason ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {output.blocked_reason}
            </div>
          ) : null}

          {output.missing_fields && output.missing_fields.length > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
              Falta: {output.missing_fields.join(", ")}
            </div>
          ) : null}

          {automation ? (
            <div className="rounded-md border border-border bg-background p-2 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">Automatización de pedido</span>
                <Badge variant={automation.decision === "created" ? "secondary" : "outline"}>
                  {automation.decision}
                </Badge>
              </div>
              {automation.decision === "created" ? (
                <div className="space-y-1 text-muted-foreground">
                  <div>Empresa: {automation.summary?.company ?? "Sin empresa"}</div>
                  <div>Zona: {automation.summary?.zone ?? "Sin zona"}</div>
                  <div>Total: {formatCurrency(automation.summary?.total ?? 0)}</div>
                </div>
              ) : null}
              {automation.decision === "needs_clarification" ? (
                <div className="text-amber-700">{automation.question}</div>
              ) : null}
              {automation.decision === "human_review" ? (
                <div className="text-muted-foreground">{automation.reason}</div>
              ) : null}
            </div>
          ) : null}

          {output.suggested_reply ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Respuesta sugerida
              </div>
              <div className="rounded-md border border-border bg-background p-2 text-sm">
                {output.suggested_reply}
              </div>
            </div>
          ) : null}

          {proposals.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Propuestas
              </div>
              {proposals.map((proposal, index) => (
                <ProposalPreview key={`${proposal.type}-${index}`} proposal={proposal} />
              ))}
            </div>
          ) : null}

          {latestAction?.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {latestAction.error}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function ProposalPreview({ proposal }: { proposal: NoraProposal }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{proposal.title}</div>
        <Badge variant="secondary">{proposal.type}</Badge>
      </div>
      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
        {JSON.stringify(proposal.payload, null, 2)}
      </pre>
    </div>
  );
}
