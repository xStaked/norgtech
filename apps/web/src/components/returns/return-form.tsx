"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ReturnFormCustomer {
  id: string;
  displayName: string;
}

export interface ReturnFormInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  outstanding: number;
}

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function ReturnForm({
  customers,
  invoices,
}: {
  customers: ReturnFormCustomer[];
  invoices: ReturnFormInvoice[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");

  // Invoices belong to the chosen customer; clear the selection if customer changes.
  const customerInvoices = useMemo(
    () => invoices.filter((i) => i.customerId === customerId),
    [invoices, customerId],
  );
  const selectedInvoice = customerInvoices.find((i) => i.id === invoiceId) ?? null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const optionalString = (key: string) => {
      const value = formData.get(key);
      return value && String(value).trim() ? String(value).trim() : undefined;
    };

    const body: Record<string, unknown> = {
      customerId,
      invoiceId: invoiceId || undefined,
      returnDate: optionalString("returnDate"),
      amount: Number(formData.get("amount")),
      reason: String(formData.get("reason")).trim(),
      notes: optionalString("notes"),
    };

    try {
      const response = await apiFetchClient("/returns", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al registrar devolucion");
        setLoading(false);
        return;
      }
      router.push("/returns");
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label>Cliente *</Label>
        <select
          name="customerId"
          required
          value={customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setInvoiceId("");
          }}
          className={selectClasses}
        >
          <option value="">Selecciona un cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Factura (opcional)</Label>
        <select
          name="invoiceId"
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
          disabled={!customerId}
          className={selectClasses}
        >
          <option value="">Sin factura (solo registro)</option>
          {customerInvoices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.invoiceNumber} — saldo {currencyFormatter.format(i.outstanding)}
            </option>
          ))}
        </select>
        {selectedInvoice && (
          <p className="text-xs text-muted-foreground">
            La nota credito no puede superar el saldo de{" "}
            {currencyFormatter.format(selectedInvoice.outstanding)}.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Fecha de devolucion</Label>
          <Input
            name="returnDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="grid gap-1">
          <Label>Monto *</Label>
          <Input
            name="amount"
            type="number"
            min={0.01}
            step={0.01}
            max={selectedInvoice ? selectedInvoice.outstanding : undefined}
            required
          />
        </div>
      </div>

      <div className="grid gap-1">
        <Label>Motivo *</Label>
        <Input name="reason" type="text" required maxLength={500} placeholder="Motivo de la devolucion" />
      </div>

      <div className="grid gap-1">
        <Label>Notas</Label>
        <Textarea name="notes" rows={3} maxLength={2000} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading || !customerId}>
          {loading ? "Registrando..." : "Registrar devolucion"}
        </Button>
      </div>
    </form>
  );
}
