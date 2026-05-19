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

interface FollowUpTaskFormProps {
  customers: Customer[];
  opportunities: Opportunity[];
}

const types = [
  { value: "llamada", label: "Llamada" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "reunion", label: "Reunión" },
  { value: "recordatorio", label: "Recordatorio" },
  { value: "otro", label: "Otro" },
];

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function FollowUpTaskForm({ customers, opportunities }: FollowUpTaskFormProps) {
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
      type: String(formData.get("type")),
      title: String(formData.get("title")),
      dueAt: String(formData.get("dueAt")),
      notes: optionalString("notes"),
    };

    try {
      const response = await apiFetchClient("/follow-up-tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la tarea");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/follow-ups/${created.id}`);
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
        <Label>Tipo *</Label>
        <select name="type" required className={selectClasses}>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
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
        <Label>Fecha y hora *</Label>
        <Input
          name="dueAt"
          type="datetime-local"
          required
        />
      </div>

      <div className="grid gap-1">
        <Label>Notas</Label>
        <Textarea name="notes" rows={3} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar tarea"}
        </Button>
      </div>
    </form>
  );
}
