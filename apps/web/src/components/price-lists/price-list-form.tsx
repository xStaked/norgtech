"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { apiFetchClient } from "@/lib/api.client";
import { PRICE_LIST_KIND_LABEL } from "@/lib/catalog";

interface PriceListFormInitial {
  name: string;
  kind: string;
  currency: string;
  country: string;
}

export function PriceListForm({ initial, listId }: { initial?: Partial<PriceListFormInitial>; listId?: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "linea");
  const [currency, setCurrency] = useState(initial?.currency ?? "COP");
  const [country, setCountry] = useState(initial?.country ?? "Colombia");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function messageOf(res: Response, fallback: string): Promise<string> {
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (typeof data.message === "string") return data.message;
      if (Array.isArray(data.message)) return data.message.join(", ");
    } catch {
      // ignore
    }
    return fallback;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: name.trim(), kind, currency, country: country.trim() || undefined });
      const res = listId
        ? await apiFetchClient(`/price-lists/${listId}`, { method: "PATCH", body })
        : await apiFetchClient("/price-lists", { method: "POST", body });
      if (!res.ok) throw new Error(await messageOf(res, "guardar la lista"));
      const data = (await res.json()) as { id: string };
      router.push(`/price-lists/${data.id}`);
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
        <Label htmlFor="price-list-name">Nombre</Label>
        <Input id="price-list-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Tipo</Label>
          <Select
            name="kind"
            value={kind}
            onValueChange={setKind}
            options={Object.entries(PRICE_LIST_KIND_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div>
          <Label>Moneda</Label>
          <Select
            name="currency"
            value={currency}
            onValueChange={setCurrency}
            options={[
              { value: "COP", label: "COP" },
              { value: "USD", label: "USD" },
            ]}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="price-list-country">País</Label>
        <Input id="price-list-country" value={country} onChange={(e) => setCountry(e.target.value)} />
      </div>
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar lista"}
        </Button>
      </div>
    </form>
  );
}
