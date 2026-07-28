"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { PriceListRef } from "@/lib/catalog";
import { UserSelect } from "@/components/users/user-select";
import { Select } from "@/components/ui/select";

interface Customer {
  id: string;
  legalName: string;
  displayName: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
  country: string | null;
  priceListId: string | null;
  notes: string | null;
  companyId: string | null;
  assignedToUserId: string | null;
  customerType: string | null;
  creditLimit: string | null;
  paymentCondition: string | null;
  paymentDays: number | null;
  purchaseBudget?: string | number | null;
}

interface CustomerFormProps {
  companies: { id: string; name: string }[];
  priceLists?: PriceListRef[];
  customer?: Customer;
}

function periodPlaceholder(periodType: string): string {
  switch (periodType.toLowerCase()) {
    case "trimestral":
      return "2025-Q1";
    case "mensual":
      return "2025-03";
    default:
      return "2025";
  }
}

export function CustomerForm({
  companies,
  priceLists = [],
  customer,
}: CustomerFormProps) {
  const router = useRouter();
  const isEditing = Boolean(customer);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [country, setCountry] = useState(customer?.country ?? "Colombia");
  const [priceListId, setPriceListId] = useState(customer?.priceListId ?? "");
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // El país solo SUGIERE la lista, nunca la cambia solo: asignarla altera lo
  // que se le cobra al cliente, y eso lo decide una persona.
  const suggestedList = priceLists.find(
    (list) =>
      list.country &&
      country.trim().toLowerCase() === list.country.toLowerCase() &&
      list.kind === "export",
  );
  const showSuggestion =
    Boolean(suggestedList) && suggestedList?.id !== priceListId && !suggestionDismissed;
  const countryOptions = [
    ...new Set(["Colombia", ...priceLists.map((list) => list.country).filter(Boolean)]),
  ] as string[];

  const [hasInitialGoal, setHasInitialGoal] = useState(false);
  const [initialGoalPeriodType, setInitialGoalPeriodType] = useState("anual");
  const [initialGoalPeriodValue, setInitialGoalPeriodValue] = useState("");
  const [initialGoalTargetAmount, setInitialGoalTargetAmount] = useState("");
  const [initialGoalNotes, setInitialGoalNotes] = useState("");

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
      legalName: String(formData.get("legalName")),
      displayName: String(formData.get("displayName")),
      taxId: optionalString("taxId"),
      phone: optionalString("phone"),
      email: optionalString("email"),
      address: optionalString("address"),
      city: optionalString("city"),
      department: optionalString("department"),
      country: country.trim() || undefined,
      priceListId: priceListId || undefined,
      notes: optionalString("notes"),
      // El segmento no se pide: lo resuelve el backend al crear y al editar se
      // deja como esta. El negocio solo maneja listas de precios.
      companyId: String(formData.get("companyId")),
      // null, no undefined: "Sin asignar" tiene que poder quitarle el vendedor
      // a un cliente. Con undefined el backend no tocaba el campo y la opción
      // no hacía nada. Al crear no aplica, ahí sí es "no vino el dato".
      assignedToUserId: isEditing
        ? (optionalString("assignedToUserId") ?? null)
        : optionalString("assignedToUserId") || undefined,
      customerType: optionalString("customerType") || undefined,
      creditLimit: formData.get("creditLimit")
        ? Number(formData.get("creditLimit"))
        : undefined,
      paymentCondition: optionalString("paymentCondition") || undefined,
      paymentDays: formData.get("paymentDays")
        ? Number(formData.get("paymentDays"))
        : undefined,
      purchaseBudget: formData.get("purchaseBudget")
        ? Number(formData.get("purchaseBudget"))
        : undefined,
    };

    if (!isEditing) {
      body.contacts = [
        {
          fullName: String(formData.get("contactFullName")),
          roleTitle: optionalString("contactRoleTitle"),
          phone: optionalString("contactPhone"),
          email: optionalString("contactEmail"),
          isPrimary: true,
          notes: optionalString("contactNotes"),
        },
      ];

      if (hasInitialGoal) {
        body.initialGoal = {
          periodType: initialGoalPeriodType,
          periodValue: initialGoalPeriodValue.trim(),
          targetAmount: Number(initialGoalTargetAmount),
          notes: initialGoalNotes.trim() || undefined,
        };
      }
    }

    try {
      const url = isEditing
        ? `/customers/${customer!.id}`
        : "/customers";
      const method = isEditing ? "PATCH" : "POST";

      const response = await apiFetchClient(url, {
        method,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al guardar el cliente");
        setLoading(false);
        return;
      }

      const result = await response.json();
      router.push(`/customers/${result.id}`);
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label>Empresa *</Label>
        <Select
          name="companyId"
          required
          defaultValue={customer?.companyId ?? ""}
          searchPlaceholder="Buscar empresa…"
          options={[
            { value: "", label: "Seleccionar empresa" },
            ...companies.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>

      <div className="grid gap-1">
        <Label>Razon social *</Label>
        <Input
          name="legalName"
          type="text"
          required
          aria-label="Razon social"
          defaultValue={customer?.legalName ?? ""}
        />
      </div>

      <div className="grid gap-1">
        <Label>Nombre comercial *</Label>
        <Input
          name="displayName"
          type="text"
          required
          aria-label="Nombre comercial"
          defaultValue={customer?.displayName ?? ""}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>NIT</Label>
          <Input name="taxId" type="text" defaultValue={customer?.taxId ?? ""} />
        </div>
        <div className="grid gap-1">
          <Label>Telefono</Label>
          <Input name="phone" type="text" defaultValue={customer?.phone ?? ""} />
        </div>
      </div>

      <div className="grid gap-1">
        <Label>Correo electronico</Label>
        <Input name="email" type="email" defaultValue={customer?.email ?? ""} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Ciudad</Label>
          <Input name="city" type="text" defaultValue={customer?.city ?? ""} />
        </div>
        <div className="grid gap-1">
          <Label>Departamento</Label>
          <Input name="department" type="text" defaultValue={customer?.department ?? ""} />
        </div>
      </div>

      <div className="grid gap-1">
        <Label>Direccion</Label>
        <Input name="address" type="text" defaultValue={customer?.address ?? ""} />
      </div>

      <div className="rounded-[11px] border border-border bg-card px-5 py-[18px]">
        <div className="text-[14.5px] font-extrabold text-foreground">Precios y facturación</div>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          La lista asignada determina a qué precio se cotiza. El país nunca la cambia solo —
          solo sugiere.
        </p>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label>País</Label>
            <Input
              list="customer-country-options"
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setSuggestionDismissed(false);
              }}
            />
            <datalist id="customer-country-options">
              {countryOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-1">
            <Label>Lista de precios</Label>
            <Select
              value={priceListId}
              onValueChange={setPriceListId}
              searchPlaceholder="Buscar lista…"
              options={[
                { value: "", label: "Sin asignar — usa precio base" },
                ...priceLists.map((list) => ({
                  value: list.id,
                  label: list.name,
                  meta: `${list.kind} · ${list.currency}`,
                })),
              ]}
            />
          </div>
        </div>

        {showSuggestion && suggestedList ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-[10px] border border-[#bcdcf0] bg-[#e4f1f9] px-3.5 py-3">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#0288c4]" />
            <span className="flex-1 text-[12.5px] leading-snug text-[#3f6a86]">
              El país es <b>{suggestedList.country}</b>. Existe la lista{" "}
              <b>{suggestedList.name}</b> ({suggestedList.kind} · {suggestedList.currency}).
              ¿Asignarla a este cliente?
            </span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setPriceListId(suggestedList.id)}
                className="h-[30px] rounded-[7px] bg-[#0f5c8a] px-3 text-xs font-bold text-white"
              >
                Asignar {suggestedList.name}
              </button>
              <button
                type="button"
                onClick={() => setSuggestionDismissed(true)}
                className="h-[30px] rounded-[7px] border border-[#bcdcf0] bg-card px-2.5 text-xs font-bold text-[#3f6a86]"
              >
                Ahora no
              </button>
            </div>
          </div>
        ) : null}

        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Sin lista asignada, las cotizaciones usan precio base + descuento de segmento.
        </p>
      </div>

      <div className="grid gap-1">
        <Label>Notas</Label>
        <Textarea name="notes" rows={3} defaultValue={customer?.notes ?? ""} />
      </div>

      <div className="grid gap-1">
        <Label>Asignado a</Label>
        <UserSelect
          name="assignedToUserId"
          value={customer?.assignedToUserId ?? ""}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Tipo de cliente</Label>
          <Select
            name="customerType"
            defaultValue={customer?.customerType ?? "cliente_directo"}
            options={[
              { value: "distribuidor", label: "Distribuidor" },
              { value: "cliente_directo", label: "Cliente directo" },
              { value: "planta_balanceados", label: "Planta de balanceados" },
              { value: "maquila", label: "Maquila" },
              { value: "otro", label: "Otro" },
            ]}
          />
        </div>
        <div className="grid gap-1">
          <Label>Condicion de pago</Label>
          <Select
            name="paymentCondition"
            defaultValue={customer?.paymentCondition ?? "contado"}
            options={[
              { value: "contado", label: "Contado" },
              { value: "credito_15", label: "Credito 15 dias" },
              { value: "credito_30", label: "Credito 30 dias" },
              { value: "credito_60", label: "Credito 60 dias" },
              { value: "credito_90", label: "Credito 90 dias" },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Cupo de credito ($)</Label>
          <Input
            name="creditLimit"
            type="number"
            min={0}
            step={1}
            defaultValue={customer?.creditLimit ?? ""}
          />
        </div>
        <div className="grid gap-1">
          <Label>Dias de pago</Label>
          <Input
            name="paymentDays"
            type="number"
            min={0}
            step={1}
            defaultValue={customer?.paymentDays ?? ""}
          />
        </div>
        <div className="grid gap-1">
          <Label>Presupuesto de compra mensual ($)</Label>
          <Input
            name="purchaseBudget"
            type="number"
            min={0}
            step={1}
            defaultValue={customer?.purchaseBudget ?? ""}
          />
        </div>
      </div>

      {!isEditing && (
        <>
          <Separator className="my-2" />

          <h3 className="text-base font-semibold">Contacto principal</h3>

          <div className="grid gap-1">
            <Label>Nombre completo *</Label>
            <Input name="contactFullName" type="text" required />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Cargo</Label>
              <Input name="contactRoleTitle" type="text" />
            </div>
            <div className="grid gap-1">
              <Label>Telefono</Label>
              <Input name="contactPhone" type="text" />
            </div>
          </div>

          <div className="grid gap-1">
            <Label>Correo del contacto</Label>
            <Input name="contactEmail" type="email" />
          </div>

          <div className="grid gap-1">
            <Label>Notas del contacto</Label>
            <Textarea name="contactNotes" rows={2} />
          </div>

          <Separator className="my-2" />

          <div className="flex items-center gap-2">
            <input
              id="hasInitialGoal"
              type="checkbox"
              className="h-4 w-4 rounded border-border text-primary"
              checked={hasInitialGoal}
              onChange={(e) => setHasInitialGoal(e.target.checked)}
            />
            <Label htmlFor="hasInitialGoal" className="cursor-pointer">
              Asignar meta comercial inicial
            </Label>
          </div>

          {hasInitialGoal && (
            <div className="grid gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label>Tipo de periodo</Label>
                  <Select
                    value={initialGoalPeriodType}
                    onValueChange={(value) => {
                      setInitialGoalPeriodType(value);
                      setInitialGoalPeriodValue("");
                    }}
                    options={[
                      { value: "anual", label: "Anual" },
                      { value: "trimestral", label: "Trimestral" },
                      { value: "mensual", label: "Mensual" },
                    ]}
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Periodo</Label>
                  <Input
                    type="text"
                    placeholder={periodPlaceholder(initialGoalPeriodType)}
                    value={initialGoalPeriodValue}
                    onChange={(e) => setInitialGoalPeriodValue(e.target.value)}
                    required={hasInitialGoal}
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Meta ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="120000000"
                    value={initialGoalTargetAmount}
                    onChange={(e) => setInitialGoalTargetAmount(e.target.value)}
                    required={hasInitialGoal}
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Notas (opcional)</Label>
                <Textarea
                  placeholder="Notas adicionales sobre la meta..."
                  value={initialGoalNotes}
                  onChange={(e) => setInitialGoalNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : isEditing ? "Guardar cambios" : "Guardar cliente"}
        </Button>
      </div>
    </form>
  );
}
