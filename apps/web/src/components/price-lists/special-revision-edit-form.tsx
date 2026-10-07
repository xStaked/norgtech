"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchClient } from "@/lib/api.client";

interface EditRow {
  customerId: string;
  customerName: string;
  currency: string;
  presentationId: string;
  presentationName: string;
  sinIva: string;
  conIva: string;
  tax: string;
}

export function SpecialRevisionEditForm({
  listId,
  revisionId,
  initial,
}: {
  listId: string;
  revisionId: string;
  initial: EditRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditRow[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(index: number, patch: Partial<EditRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = JSON.stringify({
        items: rows.map((r) => ({
          customerId: r.customerId,
          presentationId: r.presentationId,
          ...(r.sinIva.trim() !== "" ? { priceSinIva: Number(r.sinIva) } : {}),
          ...(r.conIva.trim() !== "" ? { priceConIva: Number(r.conIva) } : {}),
          ...(r.tax.trim() !== "" ? { taxPercent: Number(r.tax) } : {}),
        })),
      });
      const res = await apiFetchClient(`/special-price-lists/${listId}/revisions/${revisionId}`, {
        method: "PATCH",
        body,
      });
      if (!res.ok) throw new Error("No se pudo guardar la corrección");
      const submit = await apiFetchClient(`/special-price-lists/${listId}/revisions/${revisionId}/submit`, {
        method: "POST",
      });
      if (!submit.ok) throw new Error("Se guardó, pero no se pudo reenviar a revisión");
      router.push(`/price-lists/special/${listId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {rows.map((row, index) => (
        <div key={`${row.customerId}-${row.presentationId}`} className="grid gap-2 rounded-lg border border-border p-3">
          <div className="text-[13px] font-bold">
            {row.customerName} · {row.presentationName} · {row.currency}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label htmlFor={`edit-sin-${index}`}>Precio sin IVA</Label>
              <Input id={`edit-sin-${index}`} value={row.sinIva} onChange={(e) => update(index, { sinIva: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`edit-con-${index}`}>Precio con IVA</Label>
              <Input id={`edit-con-${index}`} value={row.conIva} onChange={(e) => update(index, { conIva: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`edit-tax-${index}`}>IVA %</Label>
              <Input id={`edit-tax-${index}`} value={row.tax} onChange={(e) => update(index, { tax: e.target.value })} />
            </div>
          </div>
        </div>
      ))}
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar y reenviar"}
        </Button>
      </div>
    </form>
  );
}
