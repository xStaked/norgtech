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
import type { LauraProposalPayload } from "./laura-types";

export type LauraProposalBlockKey = keyof LauraProposalPayload["blocks"];

type ProposalActionRow = {
  key: LauraProposalBlockKey;
  title: string;
  summary: string;
  enabled: boolean;
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

function buildActionRows(proposal: LauraProposalPayload): ProposalActionRow[] {
  const { blocks } = proposal;
  const rows: ProposalActionRow[] = [];

  if (blocks.customer) {
    rows.push({
      key: "customer",
      title: `${actionLabel[blocks.customer.action]} cliente`,
      summary: compactText(blocks.customer.displayName ?? blocks.customer.legalName, "Cliente sin nombre"),
      enabled: blocks.customer.enabled,
      Icon: Building2,
    });
  }

  if (blocks.contact) {
    rows.push({
      key: "contact",
      title: `${actionLabel[blocks.contact.action]} contacto`,
      summary: compactText(blocks.contact.fullName, "Contacto sin nombre"),
      enabled: blocks.contact.enabled,
      Icon: UserRound,
    });
  }

  if (blocks.opportunity) {
    rows.push({
      key: "opportunity",
      title: blocks.opportunity.createNew ? "Crear oportunidad" : "Actualizar oportunidad",
      summary: compactText(blocks.opportunity.title, blocks.opportunity.stage ? `Etapa ${blocks.opportunity.stage}` : "Oportunidad sin titulo"),
      enabled: blocks.opportunity.enabled,
      Icon: Target,
    });
  }

  if (blocks.quote) {
    rows.push({
      key: "quote",
      title: `${actionLabel[blocks.quote.action]} cotización`,
      summary: compactText(blocks.quote.notes, itemSummary(blocks.quote.items)),
      enabled: blocks.quote.enabled,
      Icon: FileText,
    });
  }

  if (blocks.order) {
    rows.push({
      key: "order",
      title: `${actionLabel[blocks.order.action]} pedido`,
      summary: compactText(blocks.order.notes, itemSummary(blocks.order.items)),
      enabled: blocks.order.enabled,
      Icon: ReceiptText,
    });
  }

  if (blocks.product) {
    rows.push({
      key: "product",
      title: `${actionLabel[blocks.product.action]} producto`,
      summary: compactText(blocks.product.name, blocks.product.sku),
      enabled: blocks.product.enabled,
      Icon: Package,
    });
  }

  if (blocks.segment) {
    rows.push({
      key: "segment",
      title: `${actionLabel[blocks.segment.action]} segmento`,
      summary: compactText(blocks.segment.name, "Segmento sin nombre"),
      enabled: blocks.segment.enabled,
      Icon: Tag,
    });
  }

  if (blocks.visit) {
    rows.push({
      key: "visit",
      title: `${actionLabel[blocks.visit.action]} visita`,
      summary: compactText(blocks.visit.summary, formatDate(blocks.visit.scheduledAt)),
      enabled: blocks.visit.enabled,
      Icon: Handshake,
    });
  }

  if (blocks.followUp) {
    rows.push({
      key: "followUp",
      title: "Crear seguimiento",
      summary: `${compactText(blocks.followUp.title, "Seguimiento sin titulo")} - ${formatDate(blocks.followUp.dueAt)}`,
      enabled: blocks.followUp.enabled,
      Icon: CalendarClock,
    });
  }

  if (blocks.task) {
    rows.push({
      key: "task",
      title: "Crear tarea interna",
      summary: compactText(blocks.task.title, blocks.task.notes ?? "Tarea sin titulo"),
      enabled: blocks.task.enabled,
      Icon: ClipboardList,
    });
  }

  if (blocks.interaction) {
    rows.push({
      key: "interaction",
      title: "Registrar interacción",
      summary: compactText(blocks.interaction.summary, "Resumen pendiente"),
      enabled: blocks.interaction.enabled,
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
      Icon: Activity,
    });
  }

  return rows;
}

export function LauraProposalSummary({
  proposal,
  expandedKey,
  onExpand,
}: {
  proposal: LauraProposalPayload;
  expandedKey: LauraProposalBlockKey | null;
  onExpand: (key: LauraProposalBlockKey) => void;
}) {
  const rows = buildActionRows(proposal);

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
            color: crmTheme.laura.textPrimary,
          }}
        >
          Laura preparó {rows.length} acciones para confirmar
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: crmTheme.laura.textMuted,
            lineHeight: 1.4,
          }}
        >
          Revisa o edita una acción antes de confirmar.
        </p>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(({ key, title, summary, enabled, Icon }) => {
          const expanded = expandedKey === key;

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
                minHeight: 56,
                border: `1px solid ${expanded ? crmTheme.laura.primary : crmTheme.laura.border}`,
                borderRadius: crmTheme.radius.md,
                background: expanded ? crmTheme.laura.soft : crmTheme.colors.surface,
                boxShadow: expanded ? crmTheme.laura.focusRing : "none",
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
                  background: enabled ? crmTheme.laura.gradient : crmTheme.colors.surfaceMuted,
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
                    fontSize: 13,
                    fontWeight: 700,
                    color: crmTheme.laura.textPrimary,
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
                    color: crmTheme.laura.textMuted,
                    lineHeight: 1.35,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {summary}
                </span>
              </span>

              <ChevronDown
                aria-hidden="true"
                size={16}
                color={crmTheme.laura.textMuted}
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
