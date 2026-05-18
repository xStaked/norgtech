"use client";

import {
  Activity,
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  FileText,
  Handshake,
  MessageSquare,
  Package,
  ReceiptText,
  Tag,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import { NoraProposalPayload } from "./nora-types";

export type NoraProposalBlockKey = keyof NoraProposalPayload["blocks"];

type ProposalActionRow = {
  key: NoraProposalBlockKey;
  title: string;
  summary: string;
  enabled: boolean;
  role: "primary" | "related";
  relatedTo?: string;
  Icon: LucideIcon;
};

const actionLabel: Record<"create" | "update" | "delete", string> = {
  create: "Crear",
  update: "Actualizar",
  delete: "Eliminar",
};

function formatDate(value?: string) {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha pendiente";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function compactText(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) return fallback;

  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function itemSummary(items?: Array<{ quantity: number; unitPrice: number }>) {
  if (!items?.length) return "Sin items";

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return `${items.length} item${items.length === 1 ? "" : "s"} por ${total.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  })}`;
}

function summarizeRelationship(relatedTo?: string) {
  if (!relatedTo) return "Impacto relacionado";

  if (relatedTo.startsWith("visit")) return "Depende de una visita";
  if (relatedTo.startsWith("followup")) return "Depende de un seguimiento";
  if (relatedTo.startsWith("quote")) return "Depende de una cotización";
  if (relatedTo.startsWith("order")) return "Depende de un pedido";

  return `Relacionado con ${relatedTo}`;
}

function inferRole(block: { relatedTo?: string } | undefined): "primary" | "related" {
  return block?.relatedTo ? "related" : "primary";
}

function buildActionRows(proposal: NoraProposalPayload): ProposalActionRow[] {
  const { blocks } = proposal;
  const rows: ProposalActionRow[] = [];

  if (blocks.customer) {
    rows.push({
      key: "customer",
      title: `${actionLabel[blocks.customer.action]} cliente`,
      summary: compactText(blocks.customer.displayName ?? blocks.customer.legalName, "Cliente sin nombre"),
      enabled: blocks.customer.enabled,
      role: inferRole(blocks.customer),
      relatedTo: blocks.customer.relatedTo,
      Icon: Building2,
    });
  }

  if (blocks.contact) {
    rows.push({
      key: "contact",
      title: `${actionLabel[blocks.contact.action]} contacto`,
      summary: compactText(blocks.contact.fullName, "Contacto sin nombre"),
      enabled: blocks.contact.enabled,
      role: inferRole(blocks.contact),
      relatedTo: blocks.contact.relatedTo,
      Icon: UserRound,
    });
  }

  if (blocks.opportunity) {
    rows.push({
      key: "opportunity",
      title: blocks.opportunity.createNew ? "Crear oportunidad" : "Actualizar oportunidad",
      summary: compactText(blocks.opportunity.title, blocks.opportunity.stage ? `Etapa ${blocks.opportunity.stage}` : "Oportunidad sin titulo"),
      enabled: blocks.opportunity.enabled,
      role: inferRole(blocks.opportunity),
      relatedTo: blocks.opportunity.relatedTo,
      Icon: Target,
    });
  }

  if (blocks.quote) {
    rows.push({
      key: "quote",
      title: `${actionLabel[blocks.quote.action]} cotización`,
      summary: compactText(blocks.quote.notes, itemSummary(blocks.quote.items)),
      enabled: blocks.quote.enabled,
      role: inferRole(blocks.quote),
      relatedTo: blocks.quote.relatedTo,
      Icon: FileText,
    });
  }

  if (blocks.order) {
    rows.push({
      key: "order",
      title: `${actionLabel[blocks.order.action]} pedido`,
      summary: compactText(blocks.order.notes, itemSummary(blocks.order.items)),
      enabled: blocks.order.enabled,
      role: inferRole(blocks.order),
      relatedTo: blocks.order.relatedTo,
      Icon: ReceiptText,
    });
  }

  if (blocks.product) {
    rows.push({
      key: "product",
      title: `${actionLabel[blocks.product.action]} producto`,
      summary: compactText(blocks.product.name, blocks.product.sku ?? "Producto sin nombre"),
      enabled: blocks.product.enabled,
      role: inferRole(blocks.product),
      relatedTo: blocks.product.relatedTo,
      Icon: Package,
    });
  }

  if (blocks.segment) {
    rows.push({
      key: "segment",
      title: `${actionLabel[blocks.segment.action]} segmento`,
      summary: compactText(blocks.segment.name, "Segmento sin nombre"),
      enabled: blocks.segment.enabled,
      role: inferRole(blocks.segment),
      relatedTo: blocks.segment.relatedTo,
      Icon: Tag,
    });
  }

  if (blocks.visit) {
    rows.push({
      key: "visit",
      title: `${actionLabel[blocks.visit.action]} visita`,
      summary: compactText(blocks.visit.summary, formatDate(blocks.visit.scheduledAt)),
      enabled: blocks.visit.enabled,
      role: inferRole(blocks.visit),
      relatedTo: blocks.visit.relatedTo,
      Icon: Handshake,
    });
  }

  if (blocks.followUp) {
    rows.push({
      key: "followUp",
      title: "Crear seguimiento",
      summary: `${compactText(blocks.followUp.title, "Seguimiento sin titulo")} - ${formatDate(blocks.followUp.dueAt)}`,
      enabled: blocks.followUp.enabled,
      role: inferRole(blocks.followUp),
      relatedTo: blocks.followUp.relatedTo,
      Icon: CalendarClock,
    });
  }

  if (blocks.task) {
    rows.push({
      key: "task",
      title: "Crear tarea interna",
      summary: compactText(blocks.task.title, blocks.task.notes ?? "Tarea sin titulo"),
      enabled: blocks.task.enabled,
      role: inferRole(blocks.task),
      relatedTo: blocks.task.relatedTo,
      Icon: ClipboardList,
    });
  }

  if (blocks.interaction) {
    rows.push({
      key: "interaction",
      title: "Registrar interacción",
      summary: compactText(blocks.interaction.summary, "Resumen pendiente"),
      enabled: blocks.interaction.enabled,
      role: inferRole(blocks.interaction),
      relatedTo: blocks.interaction.relatedTo,
      Icon: MessageSquare,
    });
  }

  if (blocks.signals) {
    rows.push({
      key: "signals",
      title: "Guardar señales comerciales",
      summary: [
        blocks.signals.buyingIntent ? `Intención ${blocks.signals.buyingIntent}` : null,
        blocks.signals.risk ? `riesgo ${blocks.signals.risk}` : null,
        blocks.signals.objections.length ? `${blocks.signals.objections.length} objeción${blocks.signals.objections.length === 1 ? "" : "es"}` : null,
      ]
        .filter(Boolean)
        .join(", ") || "Sin señales detectadas",
      enabled: blocks.signals.enabled,
      role: inferRole(blocks.signals),
      relatedTo: blocks.signals.relatedTo,
      Icon: Activity,
    });
  }

  return rows;
}

export function NoraProposalSummary({
  proposal,
  expandedKey,
  onExpand,
}: {
  proposal: NoraProposalPayload;
  expandedKey: NoraProposalBlockKey | null;
  onExpand: (key: NoraProposalBlockKey) => void;
}) {
  const rows = buildActionRows(proposal);
  const enabledRows = rows.filter((row) => row.enabled);
  const summary = proposal.summary;
  const primaryRows = enabledRows.filter((row) => row.role === "primary");
  const relatedRows = enabledRows.filter((row) => row.role === "related");
  const primaryCount = summary?.primaryCount ?? primaryRows.length;
  const relatedCount = summary?.relatedCount ?? relatedRows.length;
  const labels = summary?.labels?.filter(Boolean) ?? [];
  const heading = relatedCount > 0
    ? `${primaryCount} acción${primaryCount === 1 ? "" : "es"} principal${primaryCount === 1 ? "" : "es"} y ${relatedCount} impacto${relatedCount === 1 ? "" : "s"} relacionado${relatedCount === 1 ? "" : "s"}`
    : `Nora preparó ${primaryCount} acción${primaryCount === 1 ? "" : "es"} para confirmar`;

  return (
    <section
      aria-label="Resumen de propuesta"
      style={{
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "grid", gap: 2 }}>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: crmTheme.nora.textPrimary,
          }}
        >
          {heading}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: crmTheme.nora.textMuted,
            lineHeight: 1.4,
          }}
        >
          {labels.length > 0
            ? labels.slice(0, 3).join(" • ")
            : "Revisa o edita una acción antes de confirmar."}
        </p>
      </div>

      {relatedCount > 0 && (
        <div
          style={{
            display: "grid",
            gap: 4,
            padding: "10px 12px",
            borderRadius: crmTheme.radius.md,
            background: crmTheme.nora.soft,
            border: `1px solid ${crmTheme.nora.border}`,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: crmTheme.nora.textPrimary }}>
            Impacto relacionado
          </p>
          <p style={{ margin: 0, fontSize: 12, color: crmTheme.nora.textMuted, lineHeight: 1.45 }}>
            Laura detectó cambios asociados que conviene revisar junto con la acción principal.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(({ key, title, summary: rowSummary, enabled, role, relatedTo, Icon }) => {
          const expanded = expandedKey === key;
          const tone = role === "related";

          return (
            <button
              key={key}
              type="button"
              aria-expanded={expanded}
              aria-label={`Editar ${title}`}
              onClick={() => onExpand(key)}
              style={{
                appearance: "none",
                width: "100%",
                minHeight: 64,
                border: `1px solid ${
                  expanded
                    ? crmTheme.nora.primary
                    : tone
                      ? "#d8c6a4"
                      : crmTheme.nora.border
                }`,
                borderRadius: crmTheme.radius.md,
                background: expanded
                  ? crmTheme.nora.soft
                  : tone
                    ? "#fffaf1"
                    : crmTheme.colors.surface,
                boxShadow: expanded ? crmTheme.nora.focusRing : "none",
                padding: "10px 12px",
                display: "grid",
                gridTemplateColumns: "32px minmax(0, 1fr) 20px",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                textAlign: "left",
                opacity: enabled ? 1 : 0.58,
                transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: enabled
                    ? tone
                      ? "linear-gradient(135deg, #c98b2b, #e7a33d)"
                      : crmTheme.nora.gradient
                    : crmTheme.colors.surfaceMuted,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={16} color={enabled ? "#ffffff" : crmTheme.colors.textMuted} strokeWidth={2} />
              </span>

              <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                    color: tone ? "#9a6700" : crmTheme.nora.textMuted,
                  }}
                >
                  {role === "related" ? "Impacto relacionado" : "Acción principal"}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: crmTheme.nora.textPrimary,
                    lineHeight: 1.25,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {title}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: crmTheme.nora.textMuted,
                    lineHeight: 1.35,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {rowSummary}
                </span>
                {role === "related" && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "#9a6700",
                      lineHeight: 1.35,
                    }}
                  >
                    {summarizeRelationship(relatedTo)}
                  </span>
                )}
                {!enabled && (
                  <span
                    style={{
                      fontSize: 11,
                      color: crmTheme.nora.textMuted,
                      lineHeight: 1.35,
                    }}
                  >
                    Desactivada para esta confirmación
                  </span>
                )}
              </span>

              <ChevronDown
                aria-hidden="true"
                size={16}
                color={crmTheme.nora.textMuted}
                strokeWidth={2}
                style={{
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.15s ease",
                }}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
