"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { formatMoney, formatPercent } from "@/lib/pricing-preview";
import { usePricingPreview } from "@/lib/use-pricing-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { LinePriceResolution } from "./line-price-resolution";

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
  notes: string;
  /** Empaque elegido. Sin esto el backend rechaza los productos ambiguos. */
  presentationId: string;
}

interface QuoteFormProps {
  customers: Customer[];
  opportunities: Opportunity[];
  products: Product[];
}

export function QuoteForm({ customers, opportunities, products }: QuoteFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [items, setItems] = useState<QuoteItem[]>([
    { productId: "", quantity: 1, notes: "", presentationId: "" },
  ]);

  function addItem() {
    setItems([...items, { productId: "", quantity: 1, notes: "", presentationId: "" }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof QuoteItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    // Otro producto, otros empaques: la presentacion elegida ya no aplica.
    if (field === "productId") {
      updated[index].presentationId = "";
    }
    setItems(updated);
  }

  // Indices of the lines the backend will actually price, so each rendered row
  // can find its own priced line in the preview.
  const validIndices = useMemo(
    () => items.map((item, i) => (item.productId && item.quantity > 0 ? i : -1)).filter((i) => i >= 0),
    [items],
  );

  const previewItems = useMemo(
    () =>
      validIndices.map((i) => ({
        productId: items[i].productId,
        quantity: items[i].quantity,
        presentationId: items[i].presentationId || undefined,
        // Ignored by the backend for catalog lines, but the DTO requires it.
        unitPrice: 0,
      })),
    [items, validIndices],
  );

  const { preview, loading: previewLoading, error: previewError } = usePricingPreview(
    "/quotes/preview",
    selectedCustomerId,
    previewItems,
  );

  const lineFor = (index: number) => {
    const position = validIndices.indexOf(index);
    return position >= 0 ? preview?.lines[position] : undefined;
  };

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
      items: validIndices.map((i) => ({
        productId: items[i].productId,
        quantity: items[i].quantity,
        presentationId: items[i].presentationId || undefined,
        // The backend re-derives this from the catalog + segment discount; it
        // is sent only because the DTO requires the field.
        unitPrice: 0,
        notes: items[i].notes,
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
        <Select
          name="customerId"
          required
          value={selectedCustomerId}
          onValueChange={setSelectedCustomerId}
          searchPlaceholder="Buscar cliente…"
          options={[
            { value: "", label: "Seleccionar cliente" },
            ...customers.map((c) => ({ value: c.id, label: c.displayName })),
          ]}
        />
        {selectedCustomerId && preview?.segmentName && (
          <div className="text-sm text-muted-foreground">
            Segmento:{" "}
            <span className="font-medium text-foreground">{preview.segmentName}</span>
            {" "}• Descuento:{" "}
            <span className="font-medium text-foreground">
              {formatPercent(preview.discountPercent)}
            </span>
            {!preview.meetsGoal && preview.goalThreshold > 0 && (
              <span className="text-amber-700 dark:text-amber-500">
                {" "}• No aplica: faltan{" "}
                {formatMoney(Math.max(preview.goalThreshold - preview.salesYTD, 0))} para cumplir la
                meta del segmento
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-1">
        <Label>Oportunidad (opcional)</Label>
        <Select
          name="opportunityId"
          searchPlaceholder="Buscar oportunidad…"
          options={[
            { value: "", label: "Ninguna" },
            ...opportunities.map((o) => ({ value: o.id, label: o.title })),
          ]}
        />
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
              <Select
                aria-label="Producto"
                data-testid="product-select"
                value={item.productId}
                onValueChange={(value) => updateItem(index, "productId", value)}
                searchPlaceholder="Buscar producto o SKU…"
                options={[
                  { value: "", label: "Seleccionar producto" },
                  ...products.map((p) => ({
                    value: p.id,
                    label: p.name,
                    meta: `${p.sku} · $${Number(p.basePrice).toLocaleString("es-CO")}/${p.unit}`,
                  })),
                ]}
              />
              {item.productId && selectedCustomerId ? (
                <LinePriceResolution
                  productId={item.productId}
                  customerId={selectedCustomerId}
                  presentationId={item.presentationId}
                  onSelectPresentation={(presentationId) =>
                    updateItem(index, "presentationId", presentationId)
                  }
                />
              ) : null}
              {(() => {
                const line = lineFor(index);
                if (!line || line.discountPercent <= 0 || line.originalUnitPrice === null) {
                  return null;
                }
                return (
                  <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                    <span className="font-medium">
                      Descuento {formatPercent(line.discountPercent)} aplicado
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="line-through">{formatMoney(line.originalUnitPrice)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">{formatMoney(line.unitPrice)}</span>
                  </div>
                );
              })()}
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
                {/* Read-only: the price comes from the catalog and the segment
                    discount, both resolved by the backend. */}
                <div className="flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-sm text-card-foreground">
                  {lineFor(index) ? formatMoney(lineFor(index)!.unitPrice) : "—"}
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Subtotal</Label>
                <div className="flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground">
                  {lineFor(index) ? formatMoney(lineFor(index)!.subtotal) : "—"}
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

      {/* Every figure here comes from POST /quotes/preview, which runs the same
          PricingService as create() — so this summary is what gets saved. */}
      <div className="grid gap-2 rounded-lg bg-muted p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>
            {preview ? formatMoney(preview.subtotal + preview.discountAmount) : "—"}
          </span>
        </div>
        {preview && preview.discountAmount > 0 && (
          <div className="flex justify-between text-sm text-emerald-600">
            <span>Descuento por segmento ({formatPercent(preview.discountPercent)})</span>
            <span>-{formatMoney(preview.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
          <span>Total</span>
          <span data-testid="quote-total">
            {previewLoading && !preview ? "Calculando..." : preview ? formatMoney(preview.total) : "—"}
          </span>
        </div>
        {previewError ? (
          <p className="rounded-md bg-[#fcebe9] px-3 py-2 text-[12.5px] text-destructive">
            {previewError}
          </p>
        ) : null}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar cotización"}
        </Button>
      </div>
    </form>
  );
}
