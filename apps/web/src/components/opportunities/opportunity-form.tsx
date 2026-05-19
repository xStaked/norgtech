"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Customer {
  id: string;
  displayName: string;
}

interface OpportunityFormProps {
  customers: Customer[];
}

const stages = [
  { value: "prospecto", label: "Prospecto" },
  { value: "contacto", label: "Contacto" },
  { value: "visita", label: "Visita" },
  { value: "cotizacion", label: "Cotización" },
  { value: "negociacion", label: "Negociación" },
  { value: "orden_facturacion", label: "Orden de facturación" },
  { value: "venta_cerrada", label: "Venta cerrada" },
  { value: "perdida", label: "Perdida" },
];

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function OpportunityForm({ customers }: OpportunityFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const body = {
      customerId: String(formData.get("customerId")),
      title: String(formData.get("title")),
      stage: String(formData.get("stage")),
      estimatedValue: formData.get("estimatedValue")
        ? Number(formData.get("estimatedValue"))
        : undefined,
    };

    try {
      const response = await apiFetchClient("/opportunities", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la oportunidad");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/opportunities/${created.id}`);
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label>Cliente *</Label>
        <select name="customerId" required className={selectClasses}>
          <option value="">Seleccionar cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Título *</Label>
        <Input
          name="title"
          type="text"
          required
          aria-label="Titulo"
        />
      </div>

      <div className="grid gap-1">
        <Label>Etapa *</Label>
        <select name="stage" required className={selectClasses}>
          {stages.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Valor estimado</Label>
        <Input
          name="estimatedValue"
          type="number"
          min={0}
          step={0.01}
          aria-label="Valor estimado"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar oportunidad"}
        </Button>
      </div>
    </form>
  );
}
