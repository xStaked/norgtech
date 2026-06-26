"use client";

import { Badge } from "@/components/ui/badge";
import type {
  NoraConversationCase,
  NoraProposal,
  WhatsAppConversationDetail,
} from "./whatsapp-types";

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
  const activeCase = conversation?.noraCases?.[0] ?? null;

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

          {activeCase ? <NoraCasePreview activeCase={activeCase} /> : null}

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

function NoraCasePreview({ activeCase }: { activeCase: NoraConversationCase }) {
  return (
    <div className="rounded-md border border-border bg-background p-2 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">Caso activo</span>
        <Badge variant="outline">{activeCase.type}</Badge>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Badge variant="secondary">{activeCase.status}</Badge>
        <Badge variant={activeCase.riskLevel === "high" ? "destructive" : "secondary"}>
          Riesgo {riskLabels[activeCase.riskLevel] ?? activeCase.riskLevel}
        </Badge>
      </div>
      {activeCase.lastQuestion ? (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
          {activeCase.lastQuestion}
        </div>
      ) : null}
      {activeCase.missingFields.length > 0 ? (
        <div className="mb-2 text-muted-foreground">
          Faltan: {activeCase.missingFields.join(", ")}
        </div>
      ) : null}
      {activeCase.attachments.length > 0 ? (
        <div className="mb-2 text-muted-foreground">
          Adjuntos: {activeCase.attachments.length}
        </div>
      ) : null}
      {activeCase.type === "order" ? (
        <OrderCaseFields activeCase={activeCase} />
      ) : (
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
          {JSON.stringify(activeCase.extractedData, null, 2)}
        </pre>
      )}
      {activeCase.proposal ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
          {JSON.stringify(activeCase.proposal, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function OrderCaseFields({ activeCase }: { activeCase: NoraConversationCase }) {
  const data = activeCase.extractedData as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items : [];

  return (
    <div className="space-y-2">
      <FieldRow label="Cliente" value={text(data.customerRef) ?? text(data.customerId)} />
      <FieldRow label="Empresa" value={text(data.companyRef) ?? text(data.companyId)} />
      <FieldRow label="Zona/Sede" value={text(data.zoneRef) ?? text(data.customerZoneId)} />
      <FieldRow label="Notas" value={text(data.notes)} />
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Items</div>
        {items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item, index) => {
              const source = item as Record<string, unknown>;
              const product = text(source.productRef) ?? text(source.product_ref) ?? "Producto sin resolver";
              return (
                <div key={index} className="rounded border border-border p-2 text-xs">
                  <span className="font-medium">{product}</span>
                  <span className="text-muted-foreground">
                    {" "}x {String(source.quantity ?? "sin cantidad")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Sin items extraídos</div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "Pendiente"}</span>
    </div>
  );
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
