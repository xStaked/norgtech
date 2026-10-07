"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiFetchClient } from "@/lib/api.client";

interface CustomerOption {
  id: string;
  displayName: string;
  currency: string;
}

interface PresentationOption {
  id: string;
  empaque: string;
}

interface ProductOption {
  id: string;
  name: string;
  presentations: PresentationOption[];
}

interface Row {
  key: string;
  customerId: string;
  productId: string;
  presentationId: string;
  sinIva: string;
  conIva: string;
  tax: string;
}

let seq = 0;
const nextKey = () => `special-row-${(seq += 1)}`;

export function SpecialPriceListForm({
  customers,
  products,
}: {
  customers: CustomerOption[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { key: nextKey(), customerId: "", productId: "", presentationId: "", sinIva: "", conIva: "", tax: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: nextKey(), customerId: "", productId: "", presentationId: "", sinIva: "", conIva: "", tax: "" }]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (rows.some((r) => !r.customerId || !r.presentationId)) {
      setError("Cada fila necesita cliente y presentación.");
      return;
    }
    if (rows.some((r) => r.sinIva.trim() === "" && r.conIva.trim() === "")) {
      setError("Cada fila necesita al menos un precio.");
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        items: rows.map((r) => ({
          customerId: r.customerId,
          presentationId: r.presentationId,
          ...(r.sinIva.trim() !== "" ? { priceSinIva: Number(r.sinIva) } : {}),
          ...(r.conIva.trim() !== "" ? { priceConIva: Number(r.conIva) } : {}),
          ...(r.tax.trim() !== "" ? { taxPercent: Number(r.tax) } : {}),
        })),
      });
      const res = await apiFetchClient("/special-price-lists", { method: "POST", body });
      if (!res.ok) {
        let msg = "enviar la lista especial";
        try {
          const data = (await res.json()) as { message?: string | string[] };
          if (typeof data.message === "string") msg = data.message;
          else if (Array.isArray(data.message)) msg = data.message.join(", ");
        } catch {
          // keep fallback
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as { id: string };
      router.push(`/price-lists/special/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4">
      {error ? <p className="rounded-lg bg-[#fcebe9] px-4 py-2.5 text-sm text-destructive">{error}</p> : null}
      <div>
        <Label htmlFor="special-name">Nombre de la lista</Label>
        <Input id="special-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      {rows.map((row, index) => {
        const customer = customerById.get(row.customerId);
        const prod = productById.get(row.productId);
        const presentations = prod?.presentations ?? [];
        return (
          <fieldset key={row.key} className="grid gap-3 rounded-lg border border-border p-4">
            <legend className="px-1 text-[12px] font-bold text-muted-foreground">Fila {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Cliente</Label>
                <Select
                  name={`items.${index}.customerId`}
                  value={row.customerId}
                  onValueChange={(v) => updateRow(row.key, { customerId: v })}
                  placeholder="Elige cliente…"
                  options={customers.map((c) => ({ value: c.id, label: c.displayName, meta: c.currency }))}
                />
              </div>
              <div>
                <Label>Producto</Label>
                <Select
                  name={`items.${index}.productId`}
                  value={row.productId}
                  onValueChange={(v) => updateRow(row.key, { productId: v, presentationId: "" })}
                  placeholder="Elige producto…"
                  options={products.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Presentación</Label>
                <Select
                  name={`items.${index}.presentationId`}
                  value={row.presentationId}
                  onValueChange={(v) => updateRow(row.key, { presentationId: v })}
                  placeholder="Elige presentación…"
                  options={presentations.map((p) => ({ value: p.id, label: p.empaque }))}
                />
              </div>
              <div>
                <Label>Moneda del cliente</Label>
                <div data-testid={`currency-items.${index}`} className="flex h-8 items-center rounded-lg border border-input bg-muted px-2.5 text-[13px] font-bold">
                  {customer?.currency ?? "—"}
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor={`sin-${row.key}`}>Precio sin IVA</Label>
                <Input id={`sin-${row.key}`} inputMode="decimal" value={row.sinIva} onChange={(e) => updateRow(row.key, { sinIva: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`con-${row.key}`}>Precio con IVA</Label>
                <Input id={`con-${row.key}`} inputMode="decimal" value={row.conIva} onChange={(e) => updateRow(row.key, { conIva: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`tax-${row.key}`}>IVA %</Label>
                <Input id={`tax-${row.key}`} inputMode="decimal" value={row.tax} onChange={(e) => updateRow(row.key, { tax: e.target.value })} />
              </div>
            </div>
            <div>
              <Button type="button" variant="ghost" onClick={() => removeRow(row.key)}>
                Quitar fila
              </Button>
            </div>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={addRow}>
          Agregar producto y cliente
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Enviando…" : "Enviar a revisión"}
        </Button>
      </div>
    </form>
  );
}
