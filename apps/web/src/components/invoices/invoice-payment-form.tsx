"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InvoicePaymentFormProps {
  invoiceId: string;
  remainingBalance: number;
  canEdit: boolean;
}

const methodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  consignacion: "Consignacion",
  cheque: "Cheque",
  deposito: "Deposito",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

export function InvoicePaymentForm({
  invoiceId,
  remainingBalance,
  canEdit,
}: InvoicePaymentFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const amount = Number(formData.get("amount"));
    if (amount <= 0 || amount > remainingBalance) {
      setError(`El monto debe ser mayor a 0 y menor o igual al saldo (${remainingBalance.toLocaleString("es-CO")})`);
      setLoading(false);
      return;
    }

    const body = {
      invoiceId,
      amount,
      method: String(formData.get("method")),
      reference: String(formData.get("reference") || ""),
      notes: String(formData.get("notes") || ""),
      paymentDate: String(formData.get("paymentDate")),
    };

    try {
      const response = await apiFetchClient("/invoices/payments", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al registrar pago");
        setLoading(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Registrar pago
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 grid gap-3 rounded-xl border border-border bg-muted p-4"
    >
      <h4 className="text-sm font-semibold">Registrar pago</h4>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Monto *</Label>
          <Input
            name="amount"
            type="number"
            min={0.01}
            max={remainingBalance}
            step={0.01}
            required
          />
        </div>
        <div className="grid gap-1">
          <Label>Metodo *</Label>
          <select
            name="method"
            required
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {Object.entries(methodLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Referencia</Label>
          <Input name="reference" type="text" placeholder="TRX-12345" />
        </div>
        <div className="grid gap-1">
          <Label>Fecha de pago</Label>
          <Input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
      </div>

      <div className="grid gap-1">
        <Label>Notas</Label>
        <textarea
          name="notes"
          rows={2}
          className="rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar pago"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setOpen(false)}
          disabled={loading}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
