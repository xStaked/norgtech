"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetchClient } from "@/lib/api.client";

interface Customer {
  id: string;
  displayName: string;
}

interface Visit {
  id: string;
  summary?: string;
  scheduledAt?: string;
  customerId: string | null;
}

interface ExpenseFormInitialValues {
  id: string;
  expenseDate: string;
  category: string;
  amount: string | number;
  description: string;
  customerId: string | null;
  visitId: string | null;
}

interface ExpenseFormProps {
  customers: Customer[];
  visits: Visit[];
  initialValues?: ExpenseFormInitialValues;
}

const categories = [
  { value: "alimentacion", label: "Alimentacion" },
  { value: "transporte", label: "Transporte" },
  { value: "hospedaje", label: "Hospedaje" },
  { value: "combustible", label: "Combustible" },
  { value: "peajes", label: "Peajes" },
  { value: "parqueadero", label: "Parqueadero" },
  { value: "atencion_comercial", label: "Cliente / atencion comercial" },
  { value: "otros", label: "Otros" },
] as const;

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function dateInputValue(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function optionalString(value: FormDataEntryValue | null) {
  const text = value ? String(value).trim() : "";
  return text || undefined;
}

function optionalStringOrNull(value: FormDataEntryValue | null) {
  return optionalString(value) ?? null;
}

function cleanCreateFormData(formData: FormData) {
  for (const key of ["customerId", "visitId"]) {
    if (!optionalString(formData.get(key))) {
      formData.delete(key);
    }
  }
}

function getErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string") return message;
  }
  return fallback;
}

export function ExpenseForm({ customers, visits, initialValues }: ExpenseFormProps) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initialValues?.customerId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isEditing = Boolean(initialValues);

  const availableVisits = useMemo(() => {
    if (!customerId) return visits;
    return visits.filter((visit) => visit.customerId === customerId);
  }, [customerId, visits]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const amount = optionalString(formData.get("amount"));
    cleanCreateFormData(formData);

    if (!amount || Number(amount) <= 0) {
      setError("Ingresa un monto valido.");
      setLoading(false);
      return;
    }

    try {
      const response = isEditing
        ? await apiFetchClient(`/commercial-expenses/${initialValues?.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              expenseDate: String(formData.get("expenseDate")),
              category: String(formData.get("category")),
              amount: Number(amount),
              description: String(formData.get("description")).trim(),
              customerId: optionalStringOrNull(formData.get("customerId")),
              visitId: optionalStringOrNull(formData.get("visitId")),
            }),
          })
        : await apiFetchClient("/commercial-expenses", {
            method: "POST",
            body: formData,
          });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(getErrorMessage(data, isEditing ? "Error al actualizar el gasto" : "Error al crear el gasto"));
        setLoading(false);
        return;
      }

      const saved = await response.json();
      router.push(`/expenses/${saved.id}`);
      router.refresh();
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-1">
        <Label>Fecha *</Label>
        <Input name="expenseDate" type="date" required defaultValue={dateInputValue(initialValues?.expenseDate)} />
      </div>

      <div className="grid gap-1">
        <Label>Categoria *</Label>
        <select name="category" required className={selectClasses} defaultValue={initialValues?.category ?? ""}>
          <option value="">Seleccionar categoria</option>
          {categories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Monto COP *</Label>
        <Input
          name="amount"
          type="number"
          min="1"
          step="1"
          required
          defaultValue={initialValues?.amount ? String(initialValues.amount) : ""}
        />
      </div>

      <div className="grid gap-1">
        <Label>Cliente</Label>
        <select
          name="customerId"
          className={selectClasses}
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">Sin cliente</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Visita</Label>
        <select name="visitId" className={selectClasses} defaultValue={initialValues?.visitId ?? ""}>
          <option value="">Sin visita</option>
          {availableVisits.map((visit) => (
            <option key={visit.id} value={visit.id}>
              {visit.summary ?? `Visita #${visit.id.slice(-6)}`}
              {visit.scheduledAt ? ` - ${new Date(visit.scheduledAt).toLocaleDateString("es-CO")}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Descripcion *</Label>
        <Textarea name="description" rows={4} required defaultValue={initialValues?.description ?? ""} />
      </div>

      {!isEditing ? (
        <div className="grid gap-1">
          <Label>Soporte *</Label>
          <Input name="support" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        </div>
      ) : null}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : isEditing ? "Actualizar gasto" : "Guardar gasto"}
        </Button>
      </div>
    </form>
  );
}
