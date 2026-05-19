"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
}

interface VisitFormProps {
  customers: Customer[];
  opportunities: Opportunity[];
}

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function VisitForm({ customers, opportunities }: VisitFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const optionalString = (key: string) => {
      const value = formData.get(key);
      return value && String(value).trim() ? String(value).trim() : undefined;
    };

    const body = {
      customerId: String(formData.get("customerId")),
      opportunityId: optionalString("opportunityId"),
      scheduledAt: String(formData.get("scheduledAt")),
      summary: String(formData.get("summary")),
      notes: optionalString("notes"),
      nextStep: optionalString("nextStep"),
    };

    try {
      const response = await apiFetchClient("/visits", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la visita");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/visits/${created.id}`);
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
        <Label>Oportunidad</Label>
        <select name="opportunityId" className={selectClasses}>
          <option value="">Seleccionar oportunidad</option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Fecha y hora *</Label>
        <Input
          name="scheduledAt"
          type="datetime-local"
          required
        />
      </div>

      <div className="grid gap-1">
        <Label>Resumen *</Label>
        <Input
          name="summary"
          type="text"
          required
          aria-label="Resumen"
        />
      </div>

      <div className="grid gap-1">
        <Label>Notas</Label>
        <Textarea name="notes" rows={3} />
      </div>

      <div className="grid gap-1">
        <Label>Siguiente paso</Label>
        <Input name="nextStep" type="text" />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar visita"}
        </Button>
      </div>
    </form>
  );
}
