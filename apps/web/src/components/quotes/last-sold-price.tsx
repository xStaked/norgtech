"use client";

import { useEffect, useState } from "react";
import { apiFetchClient } from "@/lib/api.client";

interface LastSold {
  unitPrice: string | number;
  orderNumber: string | null;
  orderDate: string;
  orderStatus: string;
}

function formatCOP(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Referencia al cotizar: último precio VENDIDO a este cliente para este
 * producto (pedidos reales, nunca cotizaciones). Silencioso sin ventas.
 */
export function LastSoldPrice({
  customerId,
  productId,
}: {
  customerId: string;
  productId: string;
}) {
  const [last, setLast] = useState<LastSold | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!customerId || !productId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reseteo al deseleccionar cliente o producto
      setLast(null);
      setChecked(false);
      return;
    }

    let cancelled = false;
    apiFetchClient(
      `/price-lists/last-sold?customerId=${encodeURIComponent(customerId)}&productId=${encodeURIComponent(productId)}`,
    )
      .then(async (response) => {
        if (!response.ok) return null;
        const text = await response.text();
        return text ? (JSON.parse(text) as LastSold) : null;
      })
      .then((data) => {
        if (!cancelled) {
          setLast(data);
          setChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, productId]);

  if (!checked) return null;

  if (!last) {
    return <p className="text-xs text-muted-foreground">Sin ventas previas a este cliente.</p>;
  }

  return (
    <p className="text-xs text-muted-foreground">
      Último vendido: <b>{formatCOP(last.unitPrice)}</b>
      {last.orderNumber ? ` · pedido ${last.orderNumber}` : null} ·{" "}
      {formatDate(last.orderDate)}
    </p>
  );
}
