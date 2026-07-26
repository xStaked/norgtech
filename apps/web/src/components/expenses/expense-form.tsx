"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

interface ExtractedField<T> {
  value: T;
  confidence: number;
}

interface ExpenseExtractionResult {
  status: "completed" | "low_confidence";
  model: string;
  confidence: number;
  fields: {
    expenseDate?: ExtractedField<string>;
    amount?: ExtractedField<number>;
    currency?: ExtractedField<string>;
    category?: ExtractedField<string>;
    description?: ExtractedField<string>;
    supplierName?: ExtractedField<string>;
    supplierNit?: ExtractedField<string>;
    invoiceNumber?: ExtractedField<string>;
    paymentMethod?: ExtractedField<string>;
  };
  warnings: string[];
}

interface ExpenseFormInitialValues {
  id: string;
  expenseDate: string;
  category: string;
  amount: string | number;
  description: string;
  customerId: string | null;
  visitId: string | null;
  supplierName?: string | null;
  supplierNit?: string | null;
  invoiceNumber?: string | null;
  paymentMethod?: string | null;
  extractionConfidence?: string | number | null;
  extractionModel?: string | null;
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
  const supportInputRef = useRef<HTMLInputElement>(null);
  const [customerId, setCustomerId] = useState(initialValues?.customerId ?? "");
  const [expenseDate, setExpenseDate] = useState(dateInputValue(initialValues?.expenseDate));
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [amountValue, setAmountValue] = useState(initialValues?.amount ? String(initialValues.amount) : "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [supplierName, setSupplierName] = useState(initialValues?.supplierName ?? "");
  const [supplierNit, setSupplierNit] = useState(initialValues?.supplierNit ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initialValues?.invoiceNumber ?? "");
  const [paymentMethod, setPaymentMethod] = useState(initialValues?.paymentMethod ?? "");
  const [extractionConfidence, setExtractionConfidence] = useState<string>(
    initialValues?.extractionConfidence ? String(initialValues.extractionConfidence) : "",
  );
  const [extractionModel, setExtractionModel] = useState(initialValues?.extractionModel ?? "");
  const [extracting, setExtracting] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null);
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
              supplierName: optionalStringOrNull(formData.get("supplierName")),
              supplierNit: optionalStringOrNull(formData.get("supplierNit")),
              invoiceNumber: optionalStringOrNull(formData.get("invoiceNumber")),
              paymentMethod: optionalStringOrNull(formData.get("paymentMethod")),
              extractionConfidence: optionalString(formData.get("extractionConfidence"))
                ? Number(formData.get("extractionConfidence"))
                : undefined,
              extractionModel: optionalStringOrNull(formData.get("extractionModel")),
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

  async function handleExtractSupport() {
    const file = supportInputRef.current?.files?.[0];

    if (!file) {
      setExtractionMessage("Selecciona una factura para leerla con IA.");
      return;
    }

    setExtracting(true);
    setExtractionMessage(null);
    setExpenseDate(dateInputValue());
    setCategory("");
    setAmountValue("");
    setDescription("");
    setSupplierName("");
    setSupplierNit("");
    setInvoiceNumber("");
    setPaymentMethod("");
    setExtractionConfidence("");
    setExtractionModel("");

    const formData = new FormData();
    formData.set("support", file);

    try {
      const response = await apiFetchClient("/commercial-expenses/extract-support", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setExtractionMessage("No se pudo leer la factura. Puedes llenar el gasto manualmente.");
        return;
      }

      const result = (await response.json()) as ExpenseExtractionResult;
      const fields = result.fields;

      if (fields.expenseDate?.value) setExpenseDate(fields.expenseDate.value.slice(0, 10));
      if (fields.category?.value) setCategory(fields.category.value);
      if (fields.amount?.value) setAmountValue(String(Math.round(Number(fields.amount.value))));
      if (fields.description?.value) setDescription(fields.description.value);
      if (fields.supplierName?.value) setSupplierName(fields.supplierName.value);
      if (fields.supplierNit?.value) setSupplierNit(fields.supplierNit.value);
      if (fields.invoiceNumber?.value) setInvoiceNumber(fields.invoiceNumber.value);
      if (fields.paymentMethod?.value) setPaymentMethod(fields.paymentMethod.value);

      setExtractionConfidence(String(result.confidence));
      setExtractionModel(result.model);
      setExtractionMessage(
        result.status === "completed"
          ? "Factura leida. Revisa los campos antes de guardar."
          : "La factura se leyo con baja confianza. Completa o corrige los campos.",
      );
    } catch {
      setExtractionMessage("No se pudo leer la factura. Puedes llenar el gasto manualmente.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!isEditing ? (
        <div className="grid gap-2 rounded-lg border border-border p-3">
          <div className="text-sm font-semibold text-foreground">Leer factura con IA</div>
          <p className="text-xs text-muted-foreground">
            Sube una factura para prellenar el gasto. Revisa los datos antes de guardar.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleExtractSupport()}
            disabled={extracting}
          >
            {extracting ? "Leyendo..." : "Leer factura"}
          </Button>
          {extractionMessage ? <p className="text-sm text-muted-foreground">{extractionMessage}</p> : null}
        </div>
      ) : null}

      <input type="hidden" name="extractionConfidence" value={extractionConfidence} />
      <input type="hidden" name="extractionModel" value={extractionModel} />

      <div className="grid gap-1">
        <Label>Fecha *</Label>
        <Input
          name="expenseDate"
          type="date"
          required
          value={expenseDate}
          onChange={(event) => setExpenseDate(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <Label>Categoria *</Label>
        <Select
          name="category"
          required
          value={category}
          onValueChange={setCategory}
          searchPlaceholder="Buscar categoria…"
          options={[{ value: "", label: "Seleccionar categoria" }, ...categories]}
        />
      </div>

      <div className="grid gap-1">
        <Label>Monto COP *</Label>
        <Input
          name="amount"
          type="number"
          min="1"
          step="1"
          required
          value={amountValue}
          onChange={(event) => setAmountValue(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <Label>Proveedor</Label>
        <Input name="supplierName" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
      </div>

      <div className="grid gap-1">
        <Label>NIT</Label>
        <Input name="supplierNit" value={supplierNit} onChange={(event) => setSupplierNit(event.target.value)} />
      </div>

      <div className="grid gap-1">
        <Label>Numero de factura</Label>
        <Input
          name="invoiceNumber"
          value={invoiceNumber}
          onChange={(event) => setInvoiceNumber(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <Label>Medio de pago</Label>
        <Input
          name="paymentMethod"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value)}
        />
      </div>

      <div className="grid gap-1">
        <Label>Cliente</Label>
        <Select
          name="customerId"
          value={customerId}
          onValueChange={setCustomerId}
          searchPlaceholder="Buscar cliente…"
          options={[
            { value: "", label: "Sin cliente" },
            ...customers.map((customer) => ({ value: customer.id, label: customer.displayName })),
          ]}
        />
      </div>

      <div className="grid gap-1">
        <Label>Visita</Label>
        <Select
          name="visitId"
          defaultValue={initialValues?.visitId ?? ""}
          searchPlaceholder="Buscar visita…"
          options={[
            { value: "", label: "Sin visita" },
            ...availableVisits.map((visit) => ({
              value: visit.id,
              label: visit.summary ?? `Visita #${visit.id.slice(-6)}`,
              meta: visit.scheduledAt
                ? new Date(visit.scheduledAt).toLocaleDateString("es-CO")
                : undefined,
            })),
          ]}
        />
      </div>

      <div className="grid gap-1">
        <Label>Descripcion *</Label>
        <Textarea name="description" rows={4} required value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>

      {!isEditing ? (
        <div className="grid gap-1">
          <Label>Soporte *</Label>
          <Input
            ref={supportInputRef}
            name="support"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            required
          />
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
