"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type UserRole } from "@/lib/auth";
import { apiFetchClient } from "@/lib/api.client";
import type { WhatsAppConversationDetail, WhatsAppConversationStatus } from "./whatsapp-types";
import {
  UNICANAL_AGENT_ROLES,
  avatarColor,
  conversationName,
  formatOrderTotal,
  initials,
  senderTypeLabel,
} from "./whatsapp-ui";

const statusLabels: Record<WhatsAppConversationStatus, string> = {
  nuevo: "Nuevo",
  pendiente: "Pendiente",
  en_gestion: "En gestión",
  resuelto: "Resuelto",
};

const selectableStatuses: WhatsAppConversationStatus[] = [
  "pendiente",
  "en_gestion",
  "resuelto",
];

export function CustomerInfoPanel({
  conversation,
  onStatusChange,
  onRoleChange,
  canReassign,
  onCreated,
}: {
  conversation: WhatsAppConversationDetail | null;
  onStatusChange: (status: WhatsAppConversationStatus) => void;
  onRoleChange: (role: UserRole) => void;
  /** Solo supervisores y quien la tomó pueden mover el área (espejo del guard del API). */
  canReassign: boolean;
  onCreated: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!conversation) {
    return (
      <div className="flex min-h-0 items-center justify-center border-l border-border bg-card p-5 text-sm text-[#6b7787]">
        Selecciona una conversación
      </div>
    );
  }

  const name = conversationName(conversation);
  const orders = conversation.orders ?? [];
  const tags = conversation.tags ?? [];

  const latestOrder = orders[0] ?? null;
  const readyOrderCase =
    conversation.noraCases?.find(
      (noraCase) => noraCase.type === "order" && noraCase.status === "ready_for_review",
    ) ?? null;
  const latestProposal =
    conversation.noraActions
      ?.flatMap((action) => action.output?.proposals ?? [])
      .find((proposal) => proposal.type === "order_draft")?.payload ??
    conversation.noraActions?.find((action) => action.output?.proposed_order)?.output
      ?.proposed_order;
  const proposalItems = Array.isArray(latestProposal?.items) ? latestProposal.items : [];
  const canCreateFromCase = Boolean(readyOrderCase && !latestOrder);
  const canCreateDraft = Boolean(
    conversation.customer?.id &&
      latestProposal &&
      !latestOrder &&
      proposalItems.length > 0 &&
      proposalItems.every((item) => Boolean((item as Record<string, unknown>).productId)),
  );
  const canCreate = canCreateFromCase || canCreateDraft;

  async function createOrder() {
    if (!conversation || creating || !canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const response = canCreateFromCase
        ? await apiFetchClient(
            `/whatsapp/conversations/${conversation.id}/cases/${readyOrderCase!.id}/create-order`,
            { method: "POST", body: JSON.stringify({}) },
          )
        : await apiFetchClient(`/whatsapp/conversations/${conversation.id}/order-draft`, {
            method: "POST",
            body: JSON.stringify(buildOrderPayload(conversation, latestProposal!)),
          });

      if (!response.ok) {
        setError("No se pudo crear el pedido");
        return;
      }
      // El endpoint responde 2xx aunque no cree nada (falta la empresa, la zona,
      // el cliente...). Sin esto el boton no hacia nada y no se sabia por que.
      const result = (await response.json().catch(() => null)) as {
        decision?: string;
        question?: string;
        reason?: string;
      } | null;
      if (result && result.decision !== "created") {
        setError(result.question ?? result.reason ?? "No se pudo crear el pedido");
        return;
      }
      onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col overflow-auto border-l border-border bg-card p-5">
      <div className="flex flex-col items-center text-center">
        <div
          className="flex size-[60px] items-center justify-center rounded-[14px] text-lg font-bold text-white"
          style={{ backgroundColor: avatarColor(name) }}
        >
          {initials(name)}
        </div>
        <h3 className="mt-3 text-[15px] font-extrabold text-[#0c2c44]">{name}</h3>
        <p className="mt-0.5 text-xs text-[#6b7787]">{conversation.phone}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <span className="rounded-md bg-[#e6f0f6] px-2.5 py-1 text-[11px] font-semibold text-[#0f5c8a]">
            {senderTypeLabel(conversation.senderType)}
          </span>
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-md bg-[#e6f4ec] px-2.5 py-1 text-[11px] font-semibold text-[#167c4a]"
            >
              {tag.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9aa3b1]">
          Estado
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectableStatuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                conversation.status === status
                  ? "border-[#0f5c8a] bg-[#eef5fb] text-[#0f5c8a]"
                  : "border-border text-[#6b7787] hover:bg-[#f7f9fb]",
              )}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
      </div>

      {canReassign ? (
        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9aa3b1]">
            Área
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {UNICANAL_AGENT_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => onRoleChange(role)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  conversation.assignedToRole === role
                    ? "border-[#0f5c8a] bg-[#eef5fb] text-[#0f5c8a]"
                    : "border-border text-[#6b7787] hover:bg-[#f7f9fb]",
                )}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-[#9aa3b1]">
            {conversation.assignedToUser
              ? `Atiende ${conversation.assignedToUser.name}. Cambiar el área la libera para que otro la tome.`
              : "Sin dueño: cualquiera del área la puede tomar."}
          </p>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9aa3b1]">
          Pedidos recientes
        </div>
        <div className="mt-2 space-y-1">
          {orders.length === 0 ? (
            <p className="text-xs text-[#9aa3b1]">Sin pedidos asociados</p>
          ) : (
            orders.map((order) => {
              const total = formatOrderTotal(order.total);
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/orders/${order.id}`}
                      className="block truncate text-sm font-bold text-[#0f5c8a] hover:underline"
                    >
                      {order.orderNumber ?? `Pedido ${order.id.slice(-6)}`}
                    </Link>
                    <span className="text-[11px] text-[#6b7787]">{order.status}</span>
                  </div>
                  {total ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[#0c2c44]">
                      {total}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-6">
        {error ? <p className="mb-2 text-xs text-[#c2410c]">{error}</p> : null}
        <button
          type="button"
          onClick={createOrder}
          disabled={!canCreate || creating}
          title={
            canCreate
              ? "Crear pedido"
              : "Nora necesita una propuesta o caso listo para crear el pedido"
          }
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f5c8a] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0d4d75] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          Crear pedido
        </button>
      </div>
    </div>
  );
}

function buildOrderPayload(
  conversation: WhatsAppConversationDetail,
  proposal: Record<string, unknown>,
) {
  const rawItems = Array.isArray(proposal.items) ? proposal.items : [];
  const items = rawItems.map((item) => normalizeProposedItem(item)).filter(Boolean);

  return {
    customerId: conversation.customer?.id,
    orderNumber: getString(proposal.orderNumber),
    purchaseOrderNumber: getString(proposal.purchaseOrderNumber),
    orderDate: getString(proposal.orderDate),
    billingCompanyNameSnapshot: getString(proposal.billingCompanyNameSnapshot),
    branchNameSnapshot: getString(proposal.branchNameSnapshot),
    dispatchAddressSnapshot: getString(proposal.dispatchAddressSnapshot),
    requesterName:
      getString(proposal.requesterName) ??
      conversation.contact?.fullName ??
      conversation.senderName ??
      undefined,
    requesterPhone: getString(proposal.requesterPhone) ?? conversation.phone,
    requesterEmail: getString(proposal.requesterEmail),
    requesterRole: getString(proposal.requesterRole),
    deliveryInstructions: getString(proposal.deliveryInstructions),
    receiverName: getString(proposal.receiverName),
    receiverEmail: getString(proposal.receiverEmail),
    receiverPhone: getString(proposal.receiverPhone),
    receiverRole: getString(proposal.receiverRole),
    invoiceFilingPlace: getString(proposal.invoiceFilingPlace),
    approvalStatus: getString(proposal.approvalStatus) ?? "en_revision",
    approvalReason: getString(proposal.approvalReason),
    approvalName: getString(proposal.approvalName),
    reviewDate: getString(proposal.reviewDate),
    preparedByName: getString(proposal.preparedByName),
    zone: getString(proposal.zone),
    preparedByRole: getString(proposal.preparedByRole),
    requestedDeliveryDate: getString(proposal.requestedDeliveryDate),
    notes: getString(proposal.notes),
    committedDeliveryDate: getString(proposal.committedDeliveryDate),
    logisticsNotes: getString(proposal.logisticsNotes),
    items,
  };
}

function normalizeProposedItem(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const source = item as Record<string, unknown>;
  return {
    productId: getString(source.productId),
    productName: getString(source.productName) ?? getString(source.name) ?? getString(source.product),
    presentation: getString(source.presentation),
    quantity: getNumber(source.quantity) ?? 1,
    unitPrice: getNumber(source.unitPrice) ?? getNumber(source.price) ?? 0,
    taxPercent: getNumber(source.taxPercent),
    notes: getString(source.notes),
  };
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
