"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetchClient } from "@/lib/api.client";

interface ReviewQueueItem {
  id: string;
  orderNumber: string | null;
  customerNameSnapshot: string | null;
  billingCompanyNameSnapshot: string | null;
  createdAt: string;
  items: Array<{ needsResolution?: boolean }>;
  customer: { displayName: string } | null;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-normal text-muted-foreground">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-3 text-sm ${className ?? ""}`}>
      {children}
    </td>
  );
}

export function OrderReviewList() {
  const [orders, setOrders] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetchClient("/orders/review-queue")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError((data as { message?: string }).message || "Error al cargar la cola de revisión");
          return;
        }
        const data: ReviewQueueItem[] = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/30 p-5 text-sm text-muted-foreground">
        Cargando pedidos en revisión...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/30 p-5 text-sm text-muted-foreground">
        No hay pedidos pendientes de revisión.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="bg-muted/30">
            <tr>
              <Th>Pedido</Th>
              <Th>Cliente</Th>
              <Th>Empresa</Th>
              <Th>Ítems sin resolver</Th>
              <Th>Fecha</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const unresolvedCount = order.items.filter((i) => i.needsResolution).length;
              const displayNumber = order.orderNumber ?? `#${order.id.slice(-6)}`;
              const customerName = order.customerNameSnapshot ?? order.customer?.displayName ?? "—";
              const company = order.billingCompanyNameSnapshot ?? "—";

              return (
                <tr key={order.id} className="border-t border-border/60 hover:bg-muted/20 transition-colors">
                  <Td className="font-semibold text-foreground">{displayNumber}</Td>
                  <Td>{customerName}</Td>
                  <Td className="text-muted-foreground">{company}</Td>
                  <Td>
                    {unresolvedCount > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                        {unresolvedCount} sin resolver
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                        Listos
                      </span>
                    )}
                  </Td>
                  <Td className="text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString("es-CO")}
                  </Td>
                  <Td>
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Ver pedido →
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
