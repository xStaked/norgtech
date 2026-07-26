"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { toInstantString } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
      // El input da una hora local sin offset; se convierte a un instante real
      // para que el servidor no la reinterprete en SU zona (VIS-03).
      scheduledAt: toInstantString(String(formData.get("scheduledAt"))),
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
        <Select
          name="customerId"
          required
          searchPlaceholder="Buscar cliente…"
          options={[
            { value: "", label: "Seleccionar cliente" },
            ...customers.map((c) => ({ value: c.id, label: c.displayName })),
          ]}
        />
      </div>

      <div className="grid gap-1">
        <Label>Oportunidad</Label>
        <Select
          name="opportunityId"
          searchPlaceholder="Buscar oportunidad…"
          options={[
            { value: "", label: "Seleccionar oportunidad" },
            ...opportunities.map((o) => ({ value: o.id, label: o.title })),
          ]}
        />
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
