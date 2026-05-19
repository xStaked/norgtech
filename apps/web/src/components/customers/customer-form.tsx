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
}

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
  notes: string | null;
  segmentId: string | null;
  assignedToUserId: string | null;
}

interface CustomerFormProps {
  segments: Segment[];
  customer?: Customer;
}

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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

export function CustomerForm({ segments, customer }: CustomerFormProps) {
  const router = useRouter();
  const isEditing = Boolean(customer);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      notes: optionalString("notes"),
      segmentId: String(formData.get("segmentId")),
      assignedToUserId: optionalString("assignedToUserId") || undefined,
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
        <Label>Segmento *</Label>
        <select
          name="segmentId"
          required
          className={selectClasses}
          defaultValue={customer?.segmentId ?? ""}
        >
          <option value="">Seleccionar segmento</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
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

      <div className="grid gap-1">
        <Label>Notas</Label>
        <Textarea name="notes" rows={3} defaultValue={customer?.notes ?? ""} />
      </div>

      <div className="grid gap-1">
        <Label>Asignado a (ID de usuario)</Label>
        <Input
          name="assignedToUserId"
          type="text"
          defaultValue={customer?.assignedToUserId ?? ""}
        />
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
                  <select
                    className={selectClasses}
                    value={initialGoalPeriodType}
                    onChange={(e) => {
                      setInitialGoalPeriodType(e.target.value);
                      setInitialGoalPeriodValue("");
                    }}
                  >
                    <option value="anual">Anual</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="mensual">Mensual</option>
                  </select>
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
