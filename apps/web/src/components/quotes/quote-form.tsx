"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

interface Segment {
  id: string;
  name: string;
  discountPercent: string | number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: string;
}

interface Customer {
  id: string;
  displayName: string;
  segment: Segment | null;
}

interface Opportunity {
  id: string;
  title: string;
}

interface QuoteItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  discountPercent: number;
  notes: string;
}

interface QuoteFormProps {
  customers: Customer[];
  opportunities: Opportunity[];
  products: Product[];
}

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function QuoteForm({ customers, opportunities, products }: QuoteFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [items, setItems] = useState<QuoteItem[]>([
    { productId: "", quantity: 1, unitPrice: 0, originalUnitPrice: 0, discountPercent: 0, notes: "" },
  ]);

  function addItem() {
    setItems([...items, { productId: "", quantity: 1, unitPrice: 0, originalUnitPrice: 0, discountPercent: 0, notes: "" }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof QuoteItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "productId") {
      const product = products.find((p) => p.id === value);
      if (product) {
        const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
        const discountPercent = Number(selectedCustomer?.segment?.discountPercent ?? 0);
        const basePrice = Number(product.basePrice);
        const discountedPrice = Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
        updated[index].originalUnitPrice = basePrice;
        updated[index].discountPercent = discountPercent;
        updated[index].unitPrice = discountedPrice;
      }
    }
    setItems(updated);
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.originalUnitPrice, 0);
  const totalDiscount = items.reduce((sum, item) => sum + item.quantity * (item.originalUnitPrice - item.unitPrice), 0);
  const finalTotal = subtotal - totalDiscount;

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

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
      notes: optionalString("notes"),
      validUntil: optionalString("validUntil"),
      items: items
        .filter((item) => item.productId && item.quantity > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes,
        })),
    };

    if (body.items.length === 0) {
      setError("Debe agregar al menos un item válido");
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetchClient("/quotes", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la cotización");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/quotes/${created.id}`);
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-3xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label>Cliente *</Label>
        <select
          name="customerId"
          required
          className={selectClasses}
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
        >
          <option value="">Seleccionar cliente</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        {selectedCustomerId && selectedCustomer?.segment && (
          <div className="text-sm text-muted-foreground">
            Segmento:{" "}
            <span className="font-medium text-foreground">{selectedCustomer.segment.name}</span>
            {" "}• Descuento: {" "}
            <span className="font-medium text-foreground">{Number(selectedCustomer.segment.discountPercent)}%</span>
          </div>
        )}
      </div>

      <div className="grid gap-1">
        <Label>Oportunidad (opcional)</Label>
        <select name="opportunityId" className={selectClasses}>
          <option value="">Ninguna</option>
          {opportunities.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Notas</Label>
        <Textarea name="notes" rows={2} />
      </div>

      <div className="grid gap-1">
        <Label>Válida hasta</Label>
        <Input name="validUntil" type="date" />
      </div>

      <Separator className="my-2" />

      <h3 className="text-base font-semibold">Items</h3>

      <div className="grid gap-4">
        {items.map((item, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border border-border bg-muted p-4"
          >
            <div className="grid gap-1">
              <Label>Producto</Label>
              <select
                value={item.productId}
                onChange={(e) => updateItem(index, "productId", e.target.value)}
                className={selectClasses}
              >
                <option value="">Seleccionar producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — ${Number(p.basePrice).toLocaleString("es-CO")}/{p.unit}
                  </option>
                ))}
              </select>
              {item.discountPercent > 0 && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                  <span className="font-medium">Descuento {item.discountPercent}% aplicado</span>
                  <span className="text-muted-foreground">•</span>
                  <span>Precio base: ${item.originalUnitPrice.toLocaleString("es-CO")}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold">${item.unitPrice.toLocaleString("es-CO")}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min={0.0001}
                  step={0.0001}
                  value={String(item.quantity)}
                  onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-1">
                <Label>Precio unitario</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={String(item.unitPrice)}
                  onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-1">
                <Label>Subtotal</Label>
                <div className="flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground">
                  ${(item.quantity * item.unitPrice).toLocaleString("es-CO")}
                </div>
              </div>
            </div>

            <div className="grid gap-1">
              <Label>Notas del item</Label>
              <Input
                type="text"
                value={item.notes}
                onChange={(e) => updateItem(index, "notes", e.target.value)}
                placeholder="Notas opcionales"
              />
            </div>

            {items.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => removeItem(index)}
              >
                Eliminar item
              </Button>
            )}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit border-dashed"
        onClick={addItem}
      >
        + Agregar item
      </Button>

      <div className="grid gap-2 rounded-lg bg-muted p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>${subtotal.toLocaleString("es-CO")}</span>
        </div>
        {totalDiscount > 0 && (
          <div className="flex justify-between text-sm text-emerald-600">
            <span>Descuento por segmento</span>
            <span>-${totalDiscount.toLocaleString("es-CO")}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
          <span>Total</span>
          <span>${finalTotal.toLocaleString("es-CO")}</span>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar cotización"}
        </Button>
      </div>
    </form>
  );
}
