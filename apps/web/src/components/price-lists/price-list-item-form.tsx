"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiFetchClient } from "@/lib/api.client";

interface PresentationOption {
  id: string;
  empaque: string;
  productName: string;
}

export function PriceListItemForm({ listId, presentations }: { listId: string; presentations: PresentationOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [presentationId, setPresentationId] = useState("");
  const [sinIva, setSinIva] = useState("");
  const [conIva, setConIva] = useState("");
  const [tax, setTax] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!presentationId) {
      setError("Elige una presentación.");
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        presentationId,
        priceSinIva: sinIva.trim() === "" ? undefined : Number(sinIva),
        priceConIva: conIva.trim() === "" ? undefined : Number(conIva),
        taxPercent: tax.trim() === "" ? undefined : Number(tax),
      });
      const res = await apiFetchClient(`/price-lists/${listId}/items`, { method: "PUT", body });
      if (!res.ok) {
        let msg = "guardar el precio";
        try {
          const data = (await res.json()) as { message?: string | string[] };
          if (typeof data.message === "string") msg = data.message;
          else if (Array.isArray(data.message)) msg = data.message.join(", ");
        } catch {
          // keep default message
        }
        throw new Error(msg);
      }
      setOpen(false);
      setPresentationId("");
      setSinIva("");
      setConIva("");
      setTax("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Agregar precio
      </Button>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3 rounded-lg border border-border p-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div>
        <Label>Presentación</Label>
        <Select
          name="presentationId"
          value={presentationId}
          onValueChange={setPresentationId}
          placeholder="Elige presentación…"
          options={presentations.map((p) => ({ value: p.id, label: p.empaque, meta: p.productName }))}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="item-sin-iva">Precio sin IVA</Label>
          <Input id="item-sin-iva" inputMode="decimal" value={sinIva} onChange={(e) => setSinIva(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="item-con-iva">Precio con IVA</Label>
          <Input id="item-con-iva" inputMode="decimal" value={conIva} onChange={(e) => setConIva(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="item-tax">IVA %</Label>
          <Input id="item-tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar precio"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
