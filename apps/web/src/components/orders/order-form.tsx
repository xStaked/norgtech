"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CompanySelect } from "@/components/companies/company-select";

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
}

interface Opportunity {
  id: string;
  title: string;
}

interface Quote {
  id: string;
  customerId: string;
}

interface OrderItem {
  productId: string;
  productName: string;
  presentation: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  notes: string;
}

interface OrderFormProps {
  customers: Customer[];
  opportunities: Opportunity[];
  products: Product[];
  quotes: Quote[];
}

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const emptyItem = (): OrderItem => ({
  productId: "",
  productName: "",
  presentation: "",
  quantity: 1,
  unitPrice: 0,
  taxPercent: 19,
  notes: "",
});

function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function optionalNumber(value: number) {
  return Number.isFinite(value) ? value : undefined;
}

function money(value: number) {
  return `$${value.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function rowSubtotal(item: OrderItem) {
  return item.quantity * item.unitPrice;
}

function rowTax(item: OrderItem) {
  return rowSubtotal(item) * (item.taxPercent / 100);
}

function rowTotal(item: OrderItem) {
  return rowSubtotal(item) + rowTax(item);
}

export function OrderForm({ customers, opportunities, products, quotes }: OrderFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);

  function addItem() {
    setItems([...items, emptyItem()]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof OrderItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };

    if (field === "productId") {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index] = {
          ...updated[index],
          productId: product.id,
          productName: product.name,
          presentation: product.unit,
          unitPrice: Number(product.basePrice),
        };
      } else {
        updated[index].productId = "";
      }
    }

    setItems(updated);
  }

  const subtotal = items.reduce((sum, item) => sum + rowSubtotal(item), 0);
  const taxTotal = items.reduce((sum, item) => sum + rowTax(item), 0);
  const total = items.reduce((sum, item) => sum + rowTotal(item), 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payloadItems = items
      .filter((item) => (item.productId || item.productName.trim()) && item.quantity > 0)
      .map((item) => ({
        productId: item.productId || undefined,
        productName: item.productName.trim() || undefined,
        presentation: item.presentation.trim() || undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxPercent: optionalNumber(item.taxPercent),
        notes: item.notes.trim() || undefined,
      }));

    const body = {
      companyId: String(formData.get("companyId")),
      customerId: String(formData.get("customerId")),
      opportunityId: optionalString(formData.get("opportunityId")),
      sourceQuoteId: optionalString(formData.get("sourceQuoteId")),
      requestedDeliveryDate: optionalString(formData.get("requestedDeliveryDate")),
      purchaseOrderNumber: optionalString(formData.get("purchaseOrderNumber")),
      orderDate: optionalString(formData.get("orderDate")),
      billingCompanyNameSnapshot: optionalString(formData.get("billingCompanyNameSnapshot")),
      branchNameSnapshot: optionalString(formData.get("branchNameSnapshot")),
      dispatchAddressSnapshot: optionalString(formData.get("dispatchAddressSnapshot")),
      requesterName: optionalString(formData.get("requesterName")),
      requesterEmail: optionalString(formData.get("requesterEmail")),
      requesterRole: optionalString(formData.get("requesterRole")),
      requesterPhone: optionalString(formData.get("requesterPhone")),
      approvedQuoteConsecutive: optionalString(formData.get("approvedQuoteConsecutive")),
      deliveryInstructions: optionalString(formData.get("deliveryInstructions")),
      receiverName: optionalString(formData.get("receiverName")),
      receiverEmail: optionalString(formData.get("receiverEmail")),
      receiverPhone: optionalString(formData.get("receiverPhone")),
      receiverRole: optionalString(formData.get("receiverRole")),
      invoiceFilingPlace: optionalString(formData.get("invoiceFilingPlace")),
      approvalStatus: optionalString(formData.get("approvalStatus")),
      approvalReason: optionalString(formData.get("approvalReason")),
      approvalName: optionalString(formData.get("approvalName")),
      reviewDate: optionalString(formData.get("reviewDate")),
      preparedByName: optionalString(formData.get("preparedByName")),
      zone: optionalString(formData.get("zone")),
      preparedByRole: optionalString(formData.get("preparedByRole")),
      notes: optionalString(formData.get("notes")),
      items: payloadItems,
    };

    if (!body.companyId) {
      setError("Debe seleccionar una empresa facturadora");
      setLoading(false);
      return;
    }

    if (!body.customerId) {
      setError("Debe seleccionar un cliente");
      setLoading(false);
      return;
    }

    if (body.items.length === 0) {
      setError("Debe agregar al menos un producto válido");
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetchClient("/orders", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear el pedido");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/orders/${created.id}`);
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <FormSection title="Encabezado del pedido">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Empresa facturadora *" htmlFor="companyId">
            <CompanySelect name="companyId" required />
          </Field>
          <Field label="Cliente *" htmlFor="customerId">
            <select id="customerId" name="customerId" required className={selectClasses}>
              <option value="">Seleccionar cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orden de compra" htmlFor="purchaseOrderNumber">
            <Input id="purchaseOrderNumber" name="purchaseOrderNumber" />
          </Field>
          <Field label="Fecha del pedido" htmlFor="orderDate">
            <Input id="orderDate" name="orderDate" type="date" />
          </Field>
          <Field label="Fecha de entrega solicitada" htmlFor="requestedDeliveryDate">
            <Input id="requestedDeliveryDate" name="requestedDeliveryDate" type="date" />
          </Field>
          <Field label="Empresa facturadora" htmlFor="billingCompanyNameSnapshot">
            <Input id="billingCompanyNameSnapshot" name="billingCompanyNameSnapshot" />
          </Field>
          <Field label="Sede" htmlFor="branchNameSnapshot">
            <Input id="branchNameSnapshot" name="branchNameSnapshot" />
          </Field>
          <Field label="Oportunidad" htmlFor="opportunityId">
            <select id="opportunityId" name="opportunityId" className={selectClasses}>
              <option value="">Ninguna</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cotizacion origen" htmlFor="sourceQuoteId">
            <select id="sourceQuoteId" name="sourceQuoteId" className={selectClasses}>
              <option value="">Ninguna</option>
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  Cotizacion #{q.id.slice(-6)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Direccion para despacho" htmlFor="dispatchAddressSnapshot">
          <Textarea id="dispatchAddressSnapshot" name="dispatchAddressSnapshot" rows={2} />
        </Field>
      </FormSection>

      <FormSection title="Solicitante">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Solicitante" htmlFor="requesterName">
            <Input id="requesterName" name="requesterName" />
          </Field>
          <Field label="E-mail solicitante" htmlFor="requesterEmail">
            <Input id="requesterEmail" name="requesterEmail" type="email" />
          </Field>
          <Field label="Cargo solicitante" htmlFor="requesterRole">
            <Input id="requesterRole" name="requesterRole" />
          </Field>
          <Field label="Celular/telefono solicitante" htmlFor="requesterPhone">
            <Input id="requesterPhone" name="requesterPhone" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Productos">
        <div className="grid gap-4">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-border bg-muted p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(13rem,1fr)_minmax(12rem,1fr)_9rem]">
                <Field label="Producto catalogo" htmlFor={`productId-${index}`}>
                  <select
                    id={`productId-${index}`}
                    data-testid="product-select"
                    value={item.productId}
                    onChange={(e) => updateItem(index, "productId", e.target.value)}
                    className={selectClasses}
                  >
                    <option value="">Producto personalizado</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}) - {money(Number(p.basePrice))}/{p.unit}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Producto" htmlFor={`productName-${index}`}>
                  <Input
                    id={`productName-${index}`}
                    value={item.productName}
                    onChange={(e) => updateItem(index, "productName", e.target.value)}
                    placeholder="Nombre del producto"
                  />
                </Field>
                <Field label="Presentacion" htmlFor={`presentation-${index}`}>
                  <Input
                    id={`presentation-${index}`}
                    value={item.presentation}
                    onChange={(e) => updateItem(index, "presentation", e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                <Field label="Cantidad" htmlFor={`quantity-${index}`}>
                  <Input
                    id={`quantity-${index}`}
                    type="number"
                    min={0.0001}
                    step={0.0001}
                    value={String(item.quantity)}
                    onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                  />
                </Field>
                <Field label="Valor unidad" htmlFor={`unitPrice-${index}`}>
                  <Input
                    id={`unitPrice-${index}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={String(item.unitPrice)}
                    onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                  />
                </Field>
                <Field label="% IVA" htmlFor={`taxPercent-${index}`}>
                  <Input
                    id={`taxPercent-${index}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={String(item.taxPercent)}
                    onChange={(e) => updateItem(index, "taxPercent", Number(e.target.value))}
                  />
                </Field>
                <ReadOnlyMetric label="IVA" value={money(rowTax(item))} />
                <ReadOnlyMetric label="Total incl. IVA" value={money(rowTotal(item))} />
              </div>

              <Field label="Notas del item" htmlFor={`notes-${index}`}>
                <Input
                  id={`notes-${index}`}
                  value={item.notes}
                  onChange={(e) => updateItem(index, "notes", e.target.value)}
                  placeholder="Notas opcionales"
                />
              </Field>

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

        <Button type="button" variant="outline" size="sm" className="w-fit border-dashed" onClick={addItem}>
          + Agregar item
        </Button>

        <div className="grid gap-2 rounded-lg bg-muted p-4 text-sm md:ml-auto md:w-80">
          <SummaryLine label="Subtotal" value={money(subtotal)} />
          <SummaryLine label="IVA" value={money(taxTotal)} />
          <Separator />
          <SummaryLine label="Total pedido" value={money(total)} strong />
        </div>
      </FormSection>

      <FormSection title="Entrega y facturacion">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Consecutivo cotizacion aprobada" htmlFor="approvedQuoteConsecutive">
            <Input id="approvedQuoteConsecutive" name="approvedQuoteConsecutive" />
          </Field>
          <Field label="Lugar de radicacion de factura" htmlFor="invoiceFilingPlace">
            <Input id="invoiceFilingPlace" name="invoiceFilingPlace" />
          </Field>
          <Field label="Persona autorizada para recibir" htmlFor="receiverName">
            <Input id="receiverName" name="receiverName" />
          </Field>
          <Field label="Correo receptor" htmlFor="receiverEmail">
            <Input id="receiverEmail" name="receiverEmail" type="email" />
          </Field>
          <Field label="Telefono receptor" htmlFor="receiverPhone">
            <Input id="receiverPhone" name="receiverPhone" />
          </Field>
          <Field label="Cargo receptor" htmlFor="receiverRole">
            <Input id="receiverRole" name="receiverRole" />
          </Field>
        </div>
        <Field label="Observaciones / instrucciones" htmlFor="deliveryInstructions">
          <Textarea id="deliveryInstructions" name="deliveryInstructions" rows={3} />
        </Field>
        <Field label="Notas internas" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={2} />
        </Field>
      </FormSection>

      <FormSection title="Aprobacion">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Aprobacion" htmlFor="approvalStatus">
            <Input id="approvalStatus" name="approvalStatus" placeholder="Aprobado / Rechazado / Pendiente" />
          </Field>
          <Field label="Motivo" htmlFor="approvalReason">
            <Input id="approvalReason" name="approvalReason" />
          </Field>
          <Field label="Nombre aprobador" htmlFor="approvalName">
            <Input id="approvalName" name="approvalName" />
          </Field>
          <Field label="Fecha de revision" htmlFor="reviewDate">
            <Input id="reviewDate" name="reviewDate" type="date" />
          </Field>
          <Field label="Elaboro" htmlFor="preparedByName">
            <Input id="preparedByName" name="preparedByName" />
          </Field>
          <Field label="Zona" htmlFor="zone">
            <Input id="zone" name="zone" />
          </Field>
          <Field label="Cargo elaborador" htmlFor="preparedByRole">
            <Input id="preparedByRole" name="preparedByRole" />
          </Field>
        </div>
      </FormSection>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar pedido"}
        </Button>
      </div>
    </form>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ReadOnlyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground">
        {value}
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "flex justify-between text-base font-semibold" : "flex justify-between"}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
