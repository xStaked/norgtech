"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import { StatusBadge } from "@/components/ui/status-badge";
import { NoraProposalBlock } from "./nora-proposal-block";
import {
  NoraProposalSummary,
  type NoraProposalBlockKey,
} from "./nora-proposal-summary";
import { ObjectionsInput } from "./nora-objections-input";
import { NoraProposalPayload } from "./nora-types";

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
    border: `1px solid ${crmTheme.nora.border}`,
    background: crmTheme.nora.soft,
    color: crmTheme.nora.textPrimary,
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
      <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.nora.textSubtle }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={label}
        style={textInputStyle()}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = crmTheme.nora.primary;
          e.currentTarget.style.boxShadow = crmTheme.nora.focusRing;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = crmTheme.nora.border;
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
      <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.nora.textSubtle }}>
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
          e.currentTarget.style.borderColor = crmTheme.nora.primary;
          e.currentTarget.style.boxShadow = crmTheme.nora.focusRing;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = crmTheme.nora.border;
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </label>
  );
}

export function NoraProposalCard({
  proposal,
  confirming,
  confirmation,
  onChange,
  onConfirm,
}: {
  proposal: NoraProposalPayload;
  confirming: boolean;
  confirmation: NoraProposalConfirmationResponse | null;
  onChange: (proposal: NoraProposalPayload) => void;
  onConfirm: () => Promise<void>;
}) {
  const [expandedKey, setExpandedKey] = useState<NoraProposalBlockKey | null>(null);

  function updateProposal(mutator: (draft: NoraProposalPayload) => NoraProposalPayload) {
    onChange(mutator(proposal));
  }

  const confirmationErrors = confirmation?.errors ?? [];
  const hasPartialErrors = confirmationErrors.length > 0;
  const savedCount = confirmation?.saved.length ?? 0;
  const discardedCount = confirmation?.discarded.length ?? 0;

  return (
    <div
      style={{
        border: `2px solid ${crmTheme.nora.primary}`,
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
          background: crmTheme.nora.soft,
          borderBottom: `1px solid ${crmTheme.nora.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={18} color={crmTheme.nora.primary} strokeWidth={2} />
          <span style={{ fontSize: 14, fontWeight: 700, color: crmTheme.nora.textPrimary }}>
            Propuesta de Laura
          </span>
        </div>
        <StatusBadge tone={confirmation ? "success" : "info"}>
          {confirmation ? (hasPartialErrors ? "Confirmada con alertas" : "Confirmada") : "Borrador"}
        </StatusBadge>
      </div>

      {/* Blocks */}
      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        <NoraProposalSummary
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
              border: `1px solid ${hasPartialErrors ? "#e8c07d" : crmTheme.nora.border}`,
              background: hasPartialErrors ? "#fff8ea" : crmTheme.nora.soft,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: crmTheme.nora.textPrimary }}>
                {hasPartialErrors ? "Confirmación parcial" : "Confirmación completada"}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: crmTheme.nora.textMuted, lineHeight: 1.45 }}>
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
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: crmTheme.nora.textPrimary }}>
                        {error.block}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: crmTheme.nora.textMuted, lineHeight: 1.4 }}>
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
          <NoraProposalBlock
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
          </NoraProposalBlock>
        )}

        {expandedKey === "opportunity" && proposal.blocks.opportunity && (
          <NoraProposalBlock
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
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.nora.textSubtle }}>
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
          </NoraProposalBlock>
        )}

        {expandedKey === "followUp" && proposal.blocks.followUp && (
          <NoraProposalBlock
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
                <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.nora.textSubtle }}>
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
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.nora.textSubtle }}>
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
          </NoraProposalBlock>
        )}

        {expandedKey === "task" && proposal.blocks.task && (
          <NoraProposalBlock
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
          </NoraProposalBlock>
        )}

        {expandedKey === "signals" && proposal.blocks.signals && (
          <NoraProposalBlock
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
              <span style={{ fontSize: 12, fontWeight: 600, color: crmTheme.nora.textSubtle }}>
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
          </NoraProposalBlock>
        )}

        {/* Customer Block */}
        {expandedKey === "customer" && proposal.blocks.customer && (
          <NoraProposalBlock
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
          </NoraProposalBlock>
        )}

        {/* Contact Block */}
        {expandedKey === "contact" && proposal.blocks.contact && (
          <NoraProposalBlock
            title="Contacto"
            description={proposal.blocks.contact.action === "create" ? "Crear nuevo contacto." : "Actualizar datos del contacto."}
            enabled={proposal.blocks.contact.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, contact: draft.blocks.contact ? { ...draft.blocks.contact, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de contacto"
          >
            <TextField label="Nombre completo" value={proposal.blocks.contact.fullName ?? ""} onChange={(fullName) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, contact: draft.blocks.contact ? { ...draft.blocks.contact, fullName } : undefined } }))} disabled={confirming} />
            <TextField label="Telefono" value={proposal.blocks.contact.phone ?? ""} onChange={(phone) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, contact: draft.blocks.contact ? { ...draft.blocks.contact, phone } : undefined } }))} disabled={confirming} />
            <TextField label="Email" value={proposal.blocks.contact.email ?? ""} onChange={(email) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, contact: draft.blocks.contact ? { ...draft.blocks.contact, email } : undefined } }))} disabled={confirming} />
          </NoraProposalBlock>
        )}

        {/* Quote Block */}
        {expandedKey === "quote" && proposal.blocks.quote && (
          <NoraProposalBlock
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
          </NoraProposalBlock>
        )}

        {/* Order Block */}
        {expandedKey === "order" && proposal.blocks.order && (
          <NoraProposalBlock
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
          </NoraProposalBlock>
        )}

        {/* Product Block */}
        {expandedKey === "product" && proposal.blocks.product && (
          <NoraProposalBlock
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
          </NoraProposalBlock>
        )}

        {/* Segment Block */}
        {expandedKey === "segment" && proposal.blocks.segment && (
          <NoraProposalBlock
            title="Segmento"
            description={proposal.blocks.segment.action === "create" ? "Crear nuevo segmento." : "Actualizar segmento."}
            enabled={proposal.blocks.segment.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, segment: draft.blocks.segment ? { ...draft.blocks.segment, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de segmento"
          >
            <TextField label="Nombre" value={proposal.blocks.segment.name ?? ""} onChange={(name) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, segment: draft.blocks.segment ? { ...draft.blocks.segment, name } : undefined } }))} disabled={confirming} />
            <TextAreaField label="Descripcion" value={proposal.blocks.segment.description ?? ""} onChange={(description) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, segment: draft.blocks.segment ? { ...draft.blocks.segment, description } : undefined } }))} disabled={confirming} />
          </NoraProposalBlock>
        )}

        {/* Visit Block (update only — for modify flow) */}
        {expandedKey === "visit" && proposal.blocks.visit && (
          <NoraProposalBlock
            title="Visita"
            description={proposal.blocks.visit.action === "update" ? "Actualizar visita existente." : "Crear nueva visita."}
            enabled={proposal.blocks.visit.enabled}
            onToggle={(enabled) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, visit: draft.blocks.visit ? { ...draft.blocks.visit, enabled } : undefined } }))}
            toggleLabel="Guardar bloque de visita"
          >
            <TextField label="Fecha programada" value={proposal.blocks.visit.scheduledAt ? toDateTimeLocal(proposal.blocks.visit.scheduledAt) : ""} onChange={(scheduledAt) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, visit: draft.blocks.visit ? { ...draft.blocks.visit, scheduledAt: fromDateTimeLocal(scheduledAt) } : undefined } }))} disabled={confirming} />
            <TextAreaField label="Resumen" value={proposal.blocks.visit.summary ?? ""} onChange={(summary) => updateProposal((draft) => ({ ...draft, blocks: { ...draft.blocks, visit: draft.blocks.visit ? { ...draft.blocks.visit, summary } : undefined } }))} disabled={confirming} />
          </NoraProposalBlock>
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
              background: confirming ? "#d4d2e8" : crmTheme.nora.gradient,
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
