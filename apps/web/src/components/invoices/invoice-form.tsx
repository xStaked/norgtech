"use client";

import { formValue } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CompanySelect } from "@/components/companies/company-select";
import { orderOptionsForCustomer, type OriginOrder } from "@/lib/origin-select";

export interface InvoiceFormCustomer {
  id: string;
  displayName: string;
}

export function InvoiceForm({
  customers,
  orders,
}: {
  customers: InvoiceFormCustomer[];
  orders: OriginOrder[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");

  const customerOrders = useMemo(
    () => orderOptionsForCustomer(orders, customerId),
    [orders, customerId],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!companyId) {
      setError("Debes seleccionar una empresa facturadora.");
      return;
    }
    if (!customerId) {
      setError("Debes seleccionar un cliente.");
      return;
    }

    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const optionalString = (key: string) => {
      const value = formValue(formData, key);
      return value.trim() ? value.trim() : undefined;
    };

    const body: Record<string, unknown> = {
      companyId,
      customerId,
      orderId: orderId || undefined,
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
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message || "Error al crear factura");
        setLoading(false);
        return;
      }
      const result = (await response.json()) as { id: string };
      router.push(`/invoices/${result.id}`);
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label>Empresa facturadora *</Label>
        <CompanySelect value={companyId} onChange={setCompanyId} required />
      </div>

      <div className="grid gap-1">
        <Label>Cliente *</Label>
        <Select
          value={customerId}
          onValueChange={(value) => {
            setCustomerId(value);
            setOrderId("");
          }}
          placeholder="Seleccionar cliente"
          searchPlaceholder="Buscar cliente…"
          options={[
            { value: "", label: "Selecciona un cliente" },
            ...customers.map((c) => ({ value: c.id, label: c.displayName })),
          ]}
        />
      </div>

      <div className="grid gap-1">
        <Label>Pedido (opcional)</Label>
        <Select
          value={orderId}
          onValueChange={setOrderId}
          disabled={!customerId}
          hint={customerId ? undefined : "Elige primero un cliente."}
          placeholder="Sin pedido"
          searchPlaceholder="Buscar pedido…"
          options={[{ value: "", label: "Sin pedido" }, ...customerOrders]}
        />
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
        <Textarea name="notes" rows={3} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading || !customerId || !companyId}>
          {loading ? "Creando..." : "Crear factura"}
        </Button>
      </div>
    </form>
  );
}
