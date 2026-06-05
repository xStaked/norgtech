"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";

export default function NewInvoicePage() {
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

    const body: Record<string, unknown> = {
      customerId: String(formData.get("customerId")),
      orderId: optionalString("orderId"),
      invoiceNumber: optionalString("invoiceNumber"),
      issueDate: optionalString("issueDate"),
      dueDate: optionalString("dueDate"),
      subtotal: Number(formData.get("subtotal")),
      taxAmount: Number(formData.get("taxAmount")),
      totalAmount: Number(formData.get("totalAmount")),
      notes: optionalString("notes"),
    };

    try {
      const response = await apiFetchClient("/invoices", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear factura");
        setLoading(false);
        return;
      }
      const result = await response.json();
      router.push(`/invoices/${result.id}`);
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Cartera"
        title="Nueva factura"
        description="Crear una factura para un cliente."
      />

      <form
        onSubmit={handleSubmit}
        className="grid max-w-2xl gap-4 rounded-xl border border-border bg-muted p-6"
      >
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid gap-1">
          <Label>Cliente ID *</Label>
          <Input name="customerId" type="text" required placeholder="ID del cliente" />
        </div>

        <div className="grid gap-1">
          <Label>Pedido ID</Label>
          <Input name="orderId" type="text" placeholder="ID del pedido (opcional)" />
        </div>

        <div className="grid gap-1">
          <Label>Numero de factura</Label>
          <Input name="invoiceNumber" type="text" placeholder="Se genera automaticamente si se deja vacio" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label>Fecha de emision</Label>
            <Input name="issueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="grid gap-1">
            <Label>Fecha de vencimiento</Label>
            <Input name="dueDate" type="date" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label>Subtotal *</Label>
            <Input name="subtotal" type="number" min={0} step={0.01} required />
          </div>
          <div className="grid gap-1">
            <Label>IVA *</Label>
            <Input name="taxAmount" type="number" min={0} step={0.01} required />
          </div>
          <div className="grid gap-1">
            <Label>Total *</Label>
            <Input name="totalAmount" type="number" min={0} step={0.01} required />
          </div>
        </div>

        <div className="grid gap-1">
          <Label>Notas</Label>
          <textarea
            name="notes"
            rows={3}
            className="rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Creando..." : "Crear factura"}
          </Button>
        </div>
      </form>
    </div>
  );
}
