"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import { StatusBadge } from "@/components/ui/status-badge";
import { LauraProposalBlock } from "./laura-proposal-block";
import {
  LauraProposalSummary,
  type LauraProposalBlockKey,
} from "./laura-proposal-summary";
import { ObjectionsInput } from "./laura-objections-input";
import type { LauraProposalConfirmationResponse, LauraProposalPayload } from "./laura-types";

const opportunityStages = [
  { value: "prospecto", label: "Prospecto" },
  { value: "contacto", label: "Contacto" },
  { value: "visita", label: "Visita" },
  { value: "cotizacion", label: "Cotización" },
  { value: "negociacion", label: "Negociación" },
  { value: "orden_facturacion", label: "Orden de facturación" },
  { value: "venta_cerrada", label: "Venta cerrada" },
  { value: "perdida", label: "Perdida" },
] as const;

const followUpTypes = [
  { value: "llamada", label: "Llamada" },
  { value: "correo", label: "Correo" },
  { value: "reunion", label: "Reunión" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

function toDateTimeLocal(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function textInputStyle() {
  return {
    width: "100%",
    minHeight: 42,
    padding: "10px 12px",
    borderRadius: crmTheme.radius.sm,
    border: `1px solid ${crmTheme.laura.border}`,
    background: crmTheme.laura.soft,
    color: crmTheme.laura.textPrimary,
    font: `400 14px/1.4 ${crmTheme.typography.body}`,
    boxSizing: "border-box" as const,
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };
}

function TextField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={label}
        style={textInputStyle()}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = crmTheme.laura.primary;
          e.currentTarget.style.boxShadow = crmTheme.laura.focusRing;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = crmTheme.laura.border;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  rows?: number;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={rows}
        aria-label={label}
        style={{
          ...textInputStyle(),
          resize: "vertical",
          minHeight: rows * 24 + 32,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = crmTheme.laura.primary;
          e.currentTarget.style.boxShadow = crmTheme.laura.focusRing;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = crmTheme.laura.border;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </label>
  );
}

export function LauraProposalCard({
  proposal,
  confirming,
  confirmation,
  onChange,
  onConfirm,
}: {
  proposal: LauraProposalPayload;
  confirming: boolean;
  confirmation: LauraProposalConfirmationResponse | null;
  onChange: (proposal: LauraProposalPayload) => void;
  onConfirm: () => Promise<void>;
}) {
  const [expandedKey, setExpandedKey] = useState<LauraProposalBlockKey | null>(null);

  function updateProposal(mutator: (draft: LauraProposalPayload) => LauraProposalPayload) {
    onChange(mutator(proposal));
  }

  const confirmationErrors = confirmation?.errors ?? [];
  const hasPartialErrors = confirmationErrors.length > 0;
  const savedCount = confirmation?.saved.length ?? 0;
  const discardedCount = confirmation?.discarded.length ?? 0;

  return (
    <div
      style={{
        border: `2px solid ${crmTheme.laura.primary}`,
        borderRadius: 16,
        background: crmTheme.colors.surface,
        boxShadow: "0 4px 16px rgba(99,102,241,0.12)",
        display: "grid",
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 16px",
          background: crmTheme.laura.soft,
          borderBottom: `1px solid ${crmTheme.laura.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={18} color={crmTheme.laura.primary} strokeWidth={2} />
          <span style={{ fontSize: 14, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
            Propuesta de Laura
          </span>
        </div>
        <StatusBadge tone={confirmation ? "success" : "info"}>
          {confirmation ? (hasPartialErrors ? "Confirmada con alertas" : "Confirmada") : "Borrador"}
        </StatusBadge>
      </div>

      {/* Blocks */}
      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        <LauraProposalSummary
          proposal={proposal}
          expandedKey={expandedKey}
          onExpand={(key) => setExpandedKey((current) => (current === key ? null : key))}
        />

        {confirmation && (
          <div
            style={{
              display: "grid",
              gap: 10,
              padding: "12px 14px",
              borderRadius: crmTheme.radius.md,
              border: `1px solid ${hasPartialErrors ? "#e8c07d" : crmTheme.laura.border}`,
              background: hasPartialErrors ? "#fff8ea" : crmTheme.laura.soft,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
                {hasPartialErrors ? "Confirmación parcial" : "Confirmación completada"}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: crmTheme.laura.textMuted, lineHeight: 1.45 }}>
                Laura guardó {savedCount} bloque{savedCount === 1 ? "" : "s"} y descartó {discardedCount} para esta confirmación.
              </p>
            </div>

            {hasPartialErrors && (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#9a6700" }}>
                  Revisá estos impactos no guardados:
                </p>
                <div style={{ display: "grid", gap: 6 }}>
                  {confirmationErrors.map((error) => (
                    <div
                      key={`${error.block}-${error.message}`}
                      style={{
                        padding: "8px 10px",
                        borderRadius: crmTheme.radius.sm,
                        border: "1px solid #efd7a3",
                        background: "#fffdf7",
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
                        {error.block}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: crmTheme.laura.textMuted, lineHeight: 1.4 }}>
                        {error.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {expandedKey === "interaction" && proposal.blocks.interaction && (
          <LauraProposalBlock
            title="Interacción"
            description="Resumen base que se convertirá en el registro principal."
            enabled={proposal.blocks.interaction.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  interaction: draft.blocks.interaction
                    ? { ...draft.blocks.interaction, enabled }
                    : draft.blocks.interaction,
                },
              }))
            }
            toggleLabel="Guardar bloque de interacción"
          >
            <TextAreaField
              label="Resumen de la interacción"
              value={proposal.blocks.interaction.summary}
              onChange={(summary) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    interaction: draft.blocks.interaction
                      ? { ...draft.blocks.interaction, summary }
                      : draft.blocks.interaction,
                  },
                }))
              }
              disabled={confirming}
            />
            <TextAreaField
              label="Mensaje original"
              value={proposal.blocks.interaction.rawMessage}
              onChange={(rawMessage) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    interaction: draft.blocks.interaction
                      ? { ...draft.blocks.interaction, rawMessage }
                      : draft.blocks.interaction,
                  },
                }))
              }
              disabled={confirming}
              rows={4}
            />
          </LauraProposalBlock>
        )}

        {expandedKey === "opportunity" && proposal.blocks.opportunity && (
          <LauraProposalBlock
            title="Oportunidad"
            description="Define si Laura actualiza una oportunidad existente o crea una nueva."
            enabled={proposal.blocks.opportunity.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  opportunity: draft.blocks.opportunity
                    ? { ...draft.blocks.opportunity, enabled }
                    : draft.blocks.opportunity,
                },
              }))
            }
            toggleLabel="Guardar bloque de oportunidad"
          >
            <TextField
              label="Título de la oportunidad"
              value={proposal.blocks.opportunity.title ?? ""}
              onChange={(title) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    opportunity: draft.blocks.opportunity
                      ? { ...draft.blocks.opportunity, title }
                      : draft.blocks.opportunity,
                  },
                }))
              }
              disabled={confirming}
            />
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
                Etapa
              </span>
              <select
                aria-label="Etapa de la oportunidad"
                value={proposal.blocks.opportunity.stage ?? ""}
                onChange={(event) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      opportunity: draft.blocks.opportunity
                        ? { ...draft.blocks.opportunity, stage: event.target.value }
                        : draft.blocks.opportunity,
                    },
                  }))
                }
                disabled={confirming}
                style={textInputStyle()}
              >
                <option value="">Selecciona una etapa</option>
                {opportunityStages.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </LauraProposalBlock>
        )}

        {expandedKey === "followUp" && proposal.blocks.followUp && (
          <LauraProposalBlock
            title="Seguimiento"
            description="Próximo movimiento comercial con destino operativo directo."
            enabled={proposal.blocks.followUp.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  followUp: draft.blocks.followUp
                    ? { ...draft.blocks.followUp, enabled }
                    : draft.blocks.followUp,
                },
              }))
            }
            toggleLabel="Guardar bloque de seguimiento"
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              <TextField
                label="Título del seguimiento"
                value={proposal.blocks.followUp.title ?? ""}
                onChange={(title) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      followUp: draft.blocks.followUp
                        ? { ...draft.blocks.followUp, title }
                        : draft.blocks.followUp,
                    },
                  }))
                }
                disabled={confirming}
              />
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
                  Tipo
                </span>
                <select
                  aria-label="Tipo de seguimiento"
                  value={proposal.blocks.followUp.type ?? ""}
                  onChange={(event) =>
                    updateProposal((draft) => ({
                      ...draft,
                      blocks: {
                        ...draft.blocks,
                        followUp: draft.blocks.followUp
                          ? { ...draft.blocks.followUp, type: event.target.value }
                          : draft.blocks.followUp,
                      },
                    }))
                  }
                  disabled={confirming}
                  style={textInputStyle()}
                >
                  {followUpTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
                Fecha
              </span>
              <input
                type="datetime-local"
                aria-label="Fecha del seguimiento"
                value={toDateTimeLocal(proposal.blocks.followUp.dueAt)}
                onChange={(event) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      followUp: draft.blocks.followUp
                        ? {
                            ...draft.blocks.followUp,
                            dueAt: fromDateTimeLocal(event.target.value),
                          }
                        : draft.blocks.followUp,
                    },
                  }))
                }
                disabled={confirming}
                style={textInputStyle()}
              />
            </label>
          </LauraProposalBlock>
        )}

        {expandedKey === "task" && proposal.blocks.task && (
          <LauraProposalBlock
            title="Tarea interna"
            description="Bloque liviano para notas y tareas internas."
            enabled={proposal.blocks.task.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  task: draft.blocks.task
                    ? { ...draft.blocks.task, enabled }
                    : draft.blocks.task,
                },
              }))
            }
            toggleLabel="Guardar bloque de tarea interna"
          >
            <TextField
              label="Título de la tarea"
              value={proposal.blocks.task.title}
              onChange={(title) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    task: draft.blocks.task
                      ? { ...draft.blocks.task, title }
                      : draft.blocks.task,
                  },
                }))
              }
              disabled={confirming}
            />
            <TextAreaField
              label="Notas internas"
              value={proposal.blocks.task.notes ?? ""}
              onChange={(notes) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    task: draft.blocks.task
                      ? { ...draft.blocks.task, notes }
                      : draft.blocks.task,
                  },
                }))
              }
              disabled={confirming}
            />
          </LauraProposalBlock>
        )}

        {expandedKey === "signals" && proposal.blocks.signals && (
          <LauraProposalBlock
            title="Señales comerciales"
            description="Objeciones, riesgo y nivel de intención detectados."
            enabled={proposal.blocks.signals.enabled}
            onToggle={(enabled) =>
              updateProposal((draft) => ({
                ...draft,
                blocks: {
                  ...draft.blocks,
                  signals: draft.blocks.signals
                    ? { ...draft.blocks.signals, enabled }
                    : draft.blocks.signals,
                },
              }))
            }
            toggleLabel="Guardar bloque de señales"
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.laura.textSubtle }}>
                Objeciones
              </span>
              <ObjectionsInput
                objections={proposal.blocks.signals.objections}
                disabled={confirming}
                onChange={(objections) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      signals: draft.blocks.signals
                        ? { ...draft.blocks.signals, objections }
                        : draft.blocks.signals,
                    },
                  }))
                }
              />
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              <TextField
                label="Riesgo"
                value={proposal.blocks.signals.risk ?? ""}
                onChange={(risk) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      signals: draft.blocks.signals
                        ? { ...draft.blocks.signals, risk }
                        : draft.blocks.signals,
                    },
                  }))
                }
                disabled={confirming}
              />
              <TextField
                label="Intención de compra"
                value={proposal.blocks.signals.buyingIntent ?? ""}
                onChange={(buyingIntent) =>
                  updateProposal((draft) => ({
                    ...draft,
                    blocks: {
                      ...draft.blocks,
                      signals: draft.blocks.signals
                        ? { ...draft.blocks.signals, buyingIntent }
                        : draft.blocks.signals,
                    },
                  }))
                }
                disabled={confirming}
              />
            </div>
          </LauraProposalBlock>
        )}

        {/* Customer Block */}
        {expandedKey === "customer" && proposal.blocks.customer && (
          <LauraProposalBlock
            title="Cliente"
            description={proposal.blocks.customer.action === "create" ? "Crear nuevo cliente en el CRM." : "Actualizar datos del cliente."}
            enabled={proposal.blocks.customer.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de cliente"
          >
            <TextField label="Nombre legal" value={proposal.blocks.customer.legalName ?? ""} onChange={(legalName) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, legalName } : undefined } }))} disabled={confirming} />
            <TextField label="Nombre para mostrar" value={proposal.blocks.customer.displayName ?? ""} onChange={(displayName) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, displayName } : undefined } }))} disabled={confirming} />
            <TextField label="Telefono" value={proposal.blocks.customer.phone ?? ""} onChange={(phone) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, phone } : undefined } }))} disabled={confirming} />
            <TextField label="Email" value={proposal.blocks.customer.email ?? ""} onChange={(email) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, email } : undefined } }))} disabled={confirming} />
            {proposal.blocks.customer.id && <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>ID: {proposal.blocks.customer.id}</p>}
          </LauraProposalBlock>
        )}

        {/* Contact Block */}
        {expandedKey === "contact" && proposal.blocks.contact && (
          <LauraProposalBlock
            title="Contacto"
            description={proposal.blocks.contact.action === "create" ? "Crear nuevo contacto." : "Actualizar datos del contacto."}
            enabled={proposal.blocks.contact.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, contact: draft.blocks.contact ? { ...draft.blocks.contact, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de contacto"
          >
            <TextField label="Nombre completo" value={proposal.blocks.contact.fullName ?? ""} onChange={(fullName) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, contact: draft.blocks.contact ? { ...draft.blocks.contact, fullName } : undefined } }))} disabled={confirming} />
            <TextField label="Telefono" value={proposal.blocks.contact.phone ?? ""} onChange={(phone) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, contact: draft.blocks.contact ? { ...draft.blocks.contact, phone } : undefined } }))} disabled={confirming} />
            <TextField label="Email" value={proposal.blocks.contact.email ?? ""} onChange={(email) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, contact: draft.blocks.contact ? { ...draft.blocks.contact, email } : undefined } }))} disabled={confirming} />
          </LauraProposalBlock>
        )}

        {/* Quote Block */}
        {expandedKey === "quote" && proposal.blocks.quote && (
          <LauraProposalBlock
            title="Cotizacion"
            description={proposal.blocks.quote.action === "create" ? "Crear nueva cotizacion." : "Actualizar cotizacion."}
            enabled={proposal.blocks.quote.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, quote: draft.blocks.quote ? { ...draft.blocks.quote, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de cotizacion"
          >
            {proposal.blocks.quote.items && proposal.blocks.quote.items.length > 0 && (
              <div style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Items ({proposal.blocks.quote.items.length})</span>
                {proposal.blocks.quote.items.map((item, i) => (
                  <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #eee" }}>
                    Producto: {item.productId} — Cant: {item.quantity} — ${item.unitPrice?.toLocaleString("es-AR") ?? "0"}
                  </div>
                ))}
              </div>
            )}
            <TextField label="Notas" value={proposal.blocks.quote.notes ?? ""} onChange={(notes) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, quote: draft.blocks.quote ? { ...draft.blocks.quote, notes } : undefined } }))} disabled={confirming} />
          </LauraProposalBlock>
        )}

        {/* Order Block */}
        {expandedKey === "order" && proposal.blocks.order && (
          <LauraProposalBlock
            title="Pedido"
            description={proposal.blocks.order.action === "create" ? "Crear nuevo pedido." : "Actualizar pedido."}
            enabled={proposal.blocks.order.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, order: draft.blocks.order ? { ...draft.blocks.order, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de pedido"
          >
            {proposal.blocks.order.items && proposal.blocks.order.items.length > 0 && (
              <div style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Items ({proposal.blocks.order.items.length})</span>
                {proposal.blocks.order.items.map((item, i) => (
                  <div key={i} style={{ fontSize: 13, padding: "4px 0" }}>Producto: {item.productId} — Cant: {item.quantity} — ${item.unitPrice?.toLocaleString("es-AR") ?? "0"}</div>
                ))}
              </div>
            )}
            <TextField label="Notas" value={proposal.blocks.order.notes ?? ""} onChange={(notes) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, order: draft.blocks.order ? { ...draft.blocks.order, notes } : undefined } }))} disabled={confirming} />
          </LauraProposalBlock>
        )}

        {/* Product Block */}
        {expandedKey === "product" && proposal.blocks.product && (
          <LauraProposalBlock
            title="Producto"
            description={proposal.blocks.product.action === "create" ? "Crear nuevo producto." : "Actualizar producto."}
            enabled={proposal.blocks.product.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, product: draft.blocks.product ? { ...draft.blocks.product, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de producto"
          >
            <TextField label="SKU" value={proposal.blocks.product.sku ?? ""} onChange={(sku) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, product: draft.blocks.product ? { ...draft.blocks.product, sku } : undefined } }))} disabled={confirming} />
            <TextField label="Nombre" value={proposal.blocks.product.name ?? ""} onChange={(name) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, product: draft.blocks.product ? { ...draft.blocks.product, name } : undefined } }))} disabled={confirming} />
            {proposal.blocks.product.basePrice !== undefined && (
              <TextField label="Precio base" value={String(proposal.blocks.product.basePrice)} onChange={(basePrice) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, product: draft.blocks.product ? { ...draft.blocks.product, basePrice: Number(basePrice) } : undefined } }))} disabled={confirming} />
            )}
          </LauraProposalBlock>
        )}

        {/* Segment Block */}
        {expandedKey === "segment" && proposal.blocks.segment && (
          <LauraProposalBlock
            title="Segmento"
            description={proposal.blocks.segment.action === "create" ? "Crear nuevo segmento." : "Actualizar segmento."}
            enabled={proposal.blocks.segment.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, segment: draft.blocks.segment ? { ...draft.blocks.segment, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de segmento"
          >
            <TextField label="Nombre" value={proposal.blocks.segment.name ?? ""} onChange={(name) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, segment: draft.blocks.segment ? { ...draft.blocks.segment, name } : undefined } }))} disabled={confirming} />
            <TextAreaField label="Descripcion" value={proposal.blocks.segment.description ?? ""} onChange={(description) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, segment: draft.blocks.segment ? { ...draft.blocks.segment, description } : undefined } }))} disabled={confirming} />
          </LauraProposalBlock>
        )}

        {/* Visit Block (update only — for modify flow) */}
        {expandedKey === "visit" && proposal.blocks.visit && (
          <LauraProposalBlock
            title="Visita"
            description={proposal.blocks.visit.action === "update" ? "Actualizar visita existente." : "Crear nueva visita."}
            enabled={proposal.blocks.visit.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, visit: draft.blocks.visit ? { ...draft.blocks.visit, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de visita"
          >
            <TextField label="Fecha programada" value={proposal.blocks.visit.scheduledAt ? toDateTimeLocal(proposal.blocks.visit.scheduledAt) : ""} onChange={(scheduledAt) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, visit: draft.blocks.visit ? { ...draft.blocks.visit, scheduledAt: fromDateTimeLocal(scheduledAt) } : undefined } }))} disabled={confirming} />
            <TextAreaField label="Resumen" value={proposal.blocks.visit.summary ?? ""} onChange={(summary) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, visit: draft.blocks.visit ? { ...draft.blocks.visit, summary } : undefined } }))} disabled={confirming} />
          </LauraProposalBlock>
        )}
      </div>

      {/* Confirm Button */}
      <div style={{ padding: "0 16px 16px" }}>
        {confirmation ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: hasPartialErrors ? "#9a6700" : crmTheme.colors.success,
              textAlign: "center",
              padding: "8px 0",
            }}
          >
            {hasPartialErrors
              ? `Laura confirmó la operación con ${confirmationErrors.length} alerta${confirmationErrors.length === 1 ? "" : "s"} pendiente${confirmationErrors.length === 1 ? "" : "s"}.`
              : `Laura guardó ${savedCount} bloques y descartó ${discardedCount}.`}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={confirming}
            style={{
              appearance: "none",
              border: 0,
              borderRadius: crmTheme.radius.md,
              width: "100%",
              minHeight: 44,
              padding: "0 18px",
              background: confirming ? "#d4d2e8" : crmTheme.laura.gradient,
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              cursor: confirming ? "wait" : "pointer",
              transition: "background 0.15s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Sparkles size={16} />
            Confirmar propuesta
          </button>
        )}
      </div>
    </div>
  );
}
