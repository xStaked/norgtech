"use client";

import { Sparkles } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";
import { StatusBadge } from "@/components/ui/status-badge";
import { LauraProposalBlock } from "./laura-proposal-block";
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
  function updateProposal(mutator: (draft: LauraProposalPayload) => LauraProposalPayload) {
    onChange(mutator(proposal));
  }

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
          {confirmation ? "Confirmada" : "Borrador"}
        </StatusBadge>
      </div>

      {/* Blocks */}
      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        {proposal.blocks.interaction && (
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

        {proposal.blocks.opportunity && (
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

        {proposal.blocks.followUp && (
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
                value={proposal.blocks.followUp.title}
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
                  value={proposal.blocks.followUp.type}
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

        {proposal.blocks.task && (
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

        {proposal.blocks.signals && (
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
      </div>

      {/* Confirm Button */}
      <div style={{ padding: "0 16px 16px" }}>
        {confirmation ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: crmTheme.colors.success,
              textAlign: "center",
              padding: "8px 0",
            }}
          >
            Laura guardó {confirmation.saved.length} bloques y descartó {confirmation.discarded.length}.
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
