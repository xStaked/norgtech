"use client";

import { useState, useEffect, useMemo } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { formatPercent, type PreviewItemInput } from "@/lib/pricing-preview";
import { usePricingPreview } from "@/lib/use-pricing-preview";
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
  customerId: string;
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
  "h-8 w-full rounded-lg border border-input bg-card px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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

function isValidItem(item: OrderItem) {
  return Boolean(item.productId || item.productName.trim()) && item.quantity > 0;
}

export function OrderForm({ customers, opportunities, products, quotes }: OrderFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([emptyItem()]);

  const [customerZones, setCustomerZones] = useState<Array<{ id: string; zone: { name: string }; assignedTo: { name: string } | null }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  // Oportunidad/cotizacion origen: el backend rechaza con 400 si no pertenecen
  // al cliente del pedido (ORD-08). Se filtran por el cliente seleccionado para
  // no ofrecer opciones invalidas, y se controlan por estado para poder limpiar
  // una seleccion que quede huerfana al cambiar de cliente.
  const [opportunityId, setOpportunityId] = useState("");
  const [sourceQuoteId, setSourceQuoteId] = useState("");
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([]);
  const [creditSummary, setCreditSummary] = useState<{
    availableCredit: number | null;
    utilizationPercent: number | null;
  } | null>(null);

  // Vendedor al que se atribuye el pedido (GOAL-02). Si falla la carga el
  // selector queda vacio y el backend resuelve la atribucion: no bloquea.
  useEffect(() => {
    apiFetchClient("/users/sellers")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSellers(Array.isArray(data) ? data : []))
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerZones([]);
      setCreditSummary(null);
      return;
    }

    apiFetchClient(`/customers/${selectedCustomerId}/zones`)
      .then((r) => r.json())
      .then(setCustomerZones)
      .catch(() => setCustomerZones([]));

    apiFetchClient(`/credit/customers/${selectedCustomerId}/summary`)
      .then((r) => r.json())
      .then(setCreditSummary)
      .catch(() => setCreditSummary(null));
  }, [selectedCustomerId]);

  const customerOpportunities = useMemo(
    () =>
      selectedCustomerId
        ? opportunities.filter((o) => o.customerId === selectedCustomerId)
        : [],
    [opportunities, selectedCustomerId],
  );

  const customerQuotes = useMemo(
    () => (selectedCustomerId ? quotes.filter((q) => q.customerId === selectedCustomerId) : []),
    [quotes, selectedCustomerId],
  );

  // Si el cliente cambia despues de elegir origen, la seleccion previa deja de
  // ser valida: se limpia en vez de enviarse y provocar el 400 del backend.
  useEffect(() => {
    if (opportunityId && !customerOpportunities.some((o) => o.id === opportunityId)) {
      setOpportunityId("");
    }
  }, [customerOpportunities, opportunityId]);

  useEffect(() => {
    if (sourceQuoteId && !customerQuotes.some((q) => q.id === sourceQuoteId)) {
      setSourceQuoteId("");
    }
  }, [customerQuotes, sourceQuoteId]);

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

  // Indices of the lines the backend will price, so each row can find its own
  // priced line in the preview.
  const validIndices = useMemo(
    () => items.map((item, i) => (isValidItem(item) ? i : -1)).filter((i) => i >= 0),
    [items],
  );

  const previewItems = useMemo(
    () =>
      validIndices.map((i) => ({
        // Catalog lines are repriced from basePrice + segment discount; custom
        // lines keep the typed unitPrice.
        productId: items[i].productId || undefined,
        quantity: items[i].quantity,
        unitPrice: items[i].unitPrice,
        taxPercent: optionalNumber(items[i].taxPercent),
      })),
    [items, validIndices],
  );

  const { preview, loading: previewLoading } = usePricingPreview(
    "/orders/preview",
    selectedCustomerId,
    previewItems as PreviewItemInput[],
  );

  const lineFor = (index: number) => {
    const position = validIndices.indexOf(index);
    return position >= 0 ? preview?.lines[position] : undefined;
  };

  const subtotal = preview?.subtotal ?? 0;
  const taxTotal = preview?.taxAmount ?? 0;
  const total = preview?.total ?? 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payloadItems = validIndices.map((i) => ({
      productId: items[i].productId || undefined,
      productName: items[i].productName.trim() || undefined,
      presentation: items[i].presentation.trim() || undefined,
      quantity: items[i].quantity,
      unitPrice: items[i].unitPrice,
      taxPercent: optionalNumber(items[i].taxPercent),
      notes: items[i].notes.trim() || undefined,
    }));

    const body = {
      companyId: String(formData.get("companyId")),
      customerZoneId: optionalString(formData.get("customerZoneId")),
      customerId: String(formData.get("customerId")),
      sellerUserId: optionalString(formData.get("sellerUserId")),
      // Desde el estado, no del FormData: los selects deshabilitados (sin
      // cliente) no aparecen en el FormData y la seleccion huerfana ya se
      // limpio arriba.
      opportunityId: opportunityId || undefined,
      sourceQuoteId: sourceQuoteId || undefined,
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

    // Gate on the preview's total WITH IVA: that is what the backend validates
    // and what exposure sums (order.total). Gating on the subtotal under-blocked
    // by the tax amount. The backend re-checks anyway — this only fails fast.
    if (
      preview &&
      creditSummary?.availableCredit != null &&
      total > creditSummary.availableCredit
    ) {
      setError(
        `Credito excedido. Disponible: $${creditSummary.availableCredit.toLocaleString("es-CO", { maximumFractionDigits: 0 })}, Pedido: $${total.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`,
      );
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
          {customerZones.length > 0 && (
            <Field label="Zona de despacho" htmlFor="customerZoneId">
              <select id="customerZoneId" name="customerZoneId" className={selectClasses}>
                <option value="">Sin zona especifica</option>
                {customerZones.map((cz) => (
                  <option key={cz.id} value={cz.id}>
                    {cz.zone.name}{cz.assignedTo ? ` — ${cz.assignedTo.name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Cliente *" htmlFor="customerId">
            <select id="customerId" name="customerId" required className={selectClasses} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              <option value="">Seleccionar cliente</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            {creditSummary && creditSummary.availableCredit != null && (
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  background: creditSummary.availableCredit <= 0 ? "#fef3c7" : "#ecfdf3",
                  color: creditSummary.availableCredit <= 0 ? "#92400e" : "#027a48",
                }}
              >
                Credito disponible: ${creditSummary.availableCredit.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                {creditSummary.availableCredit <= 0 && " - Sin credito disponible"}
              </div>
            )}
          </Field>
          {/* Vendedor real al que se atribuye el pedido para las metas (GOAL-02).
              Distinto de "Elaboro" (preparedByName), que es texto libre y dice
              quien redacto el documento. Se deja sin preseleccionar: al omitirlo,
              el backend aplica su precedencia (cliente asignado -> creador si es
              vendedor -> ninguno). Adivinar aqui haria que el formulario mienta
              sobre lo que se guarda. */}
          <Field label="Vendedor" htmlFor="sellerUserId">
            <select id="sellerUserId" name="sellerUserId" className={selectClasses}>
              <option value="">Automatico (segun el cliente)</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
            <select
              id="opportunityId"
              name="opportunityId"
              className={selectClasses}
              value={opportunityId}
              onChange={(e) => setOpportunityId(e.target.value)}
              disabled={!selectedCustomerId}
            >
              <option value="">Ninguna</option>
              {customerOpportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
            {!selectedCustomerId && (
              <p className="text-xs text-muted-foreground">Seleccione un cliente primero</p>
            )}
          </Field>
          <Field label="Cotizacion origen" htmlFor="sourceQuoteId">
            <select
              id="sourceQuoteId"
              name="sourceQuoteId"
              className={selectClasses}
              value={sourceQuoteId}
              onChange={(e) => setSourceQuoteId(e.target.value)}
              disabled={!selectedCustomerId}
            >
              <option value="">Ninguna</option>
              {customerQuotes.map((q) => (
                <option key={q.id} value={q.id}>
                  Cotizacion #{q.id.slice(-6)}
                </option>
              ))}
            </select>
            {!selectedCustomerId && (
              <p className="text-xs text-muted-foreground">Seleccione un cliente primero</p>
            )}
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
                {item.productId ? (
                  // Catalog line: the backend reprices from basePrice + the
                  // goal-conditional segment discount and ignores any value
                  // typed here, so showing an editable field would lie.
                  <ReadOnlyMetric
                    label="Valor unidad"
                    value={lineFor(index) ? money(lineFor(index)!.unitPrice) : "—"}
                  />
                ) : (
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
                )}
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
                <ReadOnlyMetric
                  label="IVA"
                  value={
                    lineFor(index)
                      ? money(lineFor(index)!.taxAmount * lineFor(index)!.quantity)
                      : "—"
                  }
                />
                <ReadOnlyMetric
                  label="Total incl. IVA"
                  value={lineFor(index) ? money(lineFor(index)!.totalWithTax) : "—"}
                />
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

        {/* Every figure comes from POST /orders/preview, which runs the same
            PricingService as create() — so this is what gets saved (ORD-04). */}
        <div className="grid gap-2 rounded-lg bg-muted p-4 text-sm md:ml-auto md:w-80">
          {preview && preview.discountAmount > 0 && (
            <>
              <SummaryLine
                label="Subtotal sin descuento"
                value={money(subtotal + preview.discountAmount)}
              />
              <SummaryLine
                label={`Descuento segmento (${formatPercent(preview.discountPercent)})`}
                value={`-${money(preview.discountAmount)}`}
              />
            </>
          )}
          <SummaryLine label="Subtotal" value={preview ? money(subtotal) : "—"} />
          <SummaryLine label="IVA" value={preview ? money(taxTotal) : "—"} />
          <Separator />
          <SummaryLine
            label="Total pedido"
            value={previewLoading && !preview ? "Calculando..." : preview ? money(total) : "—"}
            strong
          />
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
    <section className="grid gap-4 rounded-[11px] border border-border bg-card p-[18px]">
      <h3 className="m-0 text-[14.5px] font-extrabold text-foreground">{title}</h3>
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
