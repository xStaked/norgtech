"use client";

import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetchClient } from "@/lib/api.client";
import type { WhatsAppConversationDetail } from "./whatsapp-types";

export function OrderDraftPanel({
  conversation,
  onCreated,
}: {
  conversation: WhatsAppConversationDetail | null;
  onCreated?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestOrder = conversation?.orders?.[0] ?? null;
  const latestProposal = conversation?.noraActions?.find((action) => action.output?.proposed_order)
    ?.output?.proposed_order;
  const canCreateDraft = Boolean(conversation?.customer?.id && latestProposal && !latestOrder);

  async function createDraft() {
    if (!conversation?.customer?.id || !latestProposal || creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await apiFetchClient(
        `/whatsapp/conversations/${conversation.id}/order-draft`,
        {
          method: "POST",
          body: JSON.stringify(buildOrderPayload(conversation, latestProposal)),
        },
      );

      if (!response.ok) {
        setError("No se pudo crear el pedido");
        return;
      }

      onCreated?.();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-3">
      <div className="mb-2 text-sm font-semibold text-foreground">Pedido</div>
      {latestOrder ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/orders/${latestOrder.id}`} className="text-sm font-semibold text-primary">
              {latestOrder.orderNumber ?? `Pedido ${latestOrder.id.slice(-6)}`}
            </Link>
            <Badge variant="outline">{latestOrder.status}</Badge>
          </div>
          {latestOrder.total ? (
            <div className="text-xs text-muted-foreground">Total registrado: {latestOrder.total}</div>
          ) : null}
        </div>
      ) : latestProposal ? (
        <div className="space-y-2">
          <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
            {JSON.stringify(latestProposal, null, 2)}
          </pre>
          <Button
            type="button"
            size="sm"
            onClick={createDraft}
            disabled={!canCreateDraft || creating}
            title={canCreateDraft ? "Crear pedido" : "Vincula un cliente antes de crear pedido"}
          >
            <FilePlus2 />
            Crear pedido
          </Button>
          {error ? <div className="text-xs text-destructive">{error}</div> : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Sin pedido asociado</div>
      )}
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
    items:
      items.length > 0
        ? items
        : [{ productName: "Item por confirmar", quantity: 1, unitPrice: 0 }],
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
