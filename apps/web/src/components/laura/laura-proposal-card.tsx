"use client";

import { crmTheme } from "@/components/ui/theme";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LauraProposalBlock } from "./laura-proposal-block";
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
    borderRadius: crmTheme.radius.md,
    border: `1px solid ${crmTheme.colors.borderStrong}`,
    background: crmTheme.colors.surface,
    color: crmTheme.colors.text,
    font: `400 14px/1.4 ${crmTheme.typography.body}`,
    boxSizing: "border-box" as const,
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
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={label}
        style={textInputStyle()}
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
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>
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
          minHeight: rows * 24 + 36,
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
    <SectionCard
      title="Propuesta de Laura"
      description="Edita, apaga o confirma cada bloque antes de persistirlo en el CRM."
      actions={
        <StatusBadge tone={confirmation ? "success" : "info"}>
          {confirmation ? "Confirmada" : "Borrador"}
        </StatusBadge>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {proposal.blocks.interaction ? (
          <LauraProposalBlock
            title="Interacción"
            description="Resumen base que se convertirá en el registro principal de la conversación."
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
        ) : null}

        {proposal.blocks.opportunity ? (
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
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>
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
        ) : null}

        {proposal.blocks.followUp ? (
          <LauraProposalBlock
            title="Seguimiento"
            description="Próximo movimiento comercial que sí tiene destino operativo directo."
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
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
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
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>
                  Tipo de seguimiento
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
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: crmTheme.colors.textSubtle }}>
                Fecha del seguimiento
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
        ) : null}

        {proposal.blocks.task ? (
          <LauraProposalBlock
            title="Tarea interna"
            description="Bloque liviano para dejar claro qué se conserva y qué se descarta en V1."
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
        ) : null}

        {proposal.blocks.signals ? (
          <LauraProposalBlock
            title="Señales comerciales"
            description="Objeciones, riesgo y nivel de intención detectados en la conversación."
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
            <TextField
              label="Objeciones"
              value={proposal.blocks.signals.objections.join(", ")}
              onChange={(value) =>
                updateProposal((draft) => ({
                  ...draft,
                  blocks: {
                    ...draft.blocks,
                    signals: draft.blocks.signals
                      ? {
                          ...draft.blocks.signals,
                          objections: value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        }
                      : draft.blocks.signals,
                  },
                }))
              }
              disabled={confirming}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
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
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            paddingTop: 4,
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            {confirmation ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: crmTheme.colors.success,
                }}
              >
                Laura guardó {confirmation.saved.length} bloques y descartó{" "}
                {confirmation.discarded.length}.
              </p>
            ) : (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: crmTheme.colors.textMuted,
                }}
              >
                Confirma el borrador cuando los bloques reflejen lo que quieres registrar.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={confirming}
            style={{
              appearance: "none",
              border: 0,
              borderRadius: crmTheme.radius.md,
              minHeight: 44,
              padding: "0 18px",
              background: confirming ? crmTheme.colors.borderStrong : crmTheme.colors.primary,
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              cursor: confirming ? "wait" : "pointer",
            }}
          >
            Confirmar propuesta
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
