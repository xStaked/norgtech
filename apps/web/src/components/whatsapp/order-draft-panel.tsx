"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { WhatsAppConversationDetail } from "./whatsapp-types";

export function OrderDraftPanel({
  conversation,
}: {
  conversation: WhatsAppConversationDetail | null;
}) {
  const latestOrder = conversation?.orders?.[0] ?? null;
  const latestProposal = conversation?.noraActions?.find((action) => action.output?.proposed_order)
    ?.output?.proposed_order;

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
        <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
          {JSON.stringify(latestProposal, null, 2)}
        </pre>
      ) : (
        <div className="text-sm text-muted-foreground">Sin pedido asociado</div>
      )}
    </div>
  );
}
