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

interface CustomerFormProps {
  segments: Segment[];
}

const selectClasses =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function CustomerForm({ segments }: CustomerFormProps) {
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

    const body = {
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
      contacts: [
        {
          fullName: String(formData.get("contactFullName")),
          roleTitle: optionalString("contactRoleTitle"),
          phone: optionalString("contactPhone"),
          email: optionalString("contactEmail"),
          isPrimary: true,
          notes: optionalString("contactNotes"),
        },
      ],
    };

    try {
      const response = await apiFetchClient("/customers", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear el cliente");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/customers/${created.id}`);
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label>Segmento *</Label>
        <select name="segmentId" required className={selectClasses}>
          <option value="">Seleccionar segmento</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1">
        <Label>Razón social *</Label>
        <Input
          name="legalName"
          type="text"
          required
          aria-label="Razon social"
        />
      </div>

      <div className="grid gap-1">
        <Label>Nombre comercial *</Label>
        <Input
          name="displayName"
          type="text"
          required
          aria-label="Nombre comercial"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>NIT</Label>
          <Input name="taxId" type="text" />
        </div>
        <div className="grid gap-1">
          <Label>Teléfono</Label>
          <Input name="phone" type="text" />
        </div>
      </div>

      <div className="grid gap-1">
        <Label>Correo electrónico</Label>
        <Input name="email" type="email" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Ciudad</Label>
          <Input name="city" type="text" />
        </div>
        <div className="grid gap-1">
          <Label>Departamento</Label>
          <Input name="department" type="text" />
        </div>
      </div>

      <div className="grid gap-1">
        <Label>Dirección</Label>
        <Input name="address" type="text" />
      </div>

      <div className="grid gap-1">
        <Label>Notas</Label>
        <Textarea name="notes" rows={3} />
      </div>

      <Separator className="my-2" />

      <h3 className="text-base font-semibold">Contacto principal</h3>

      <div className="grid gap-1">
        <Label>Nombre completo *</Label>
        <Input
          name="contactFullName"
          type="text"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Cargo</Label>
          <Input name="contactRoleTitle" type="text" />
        </div>
        <div className="grid gap-1">
          <Label>Teléfono</Label>
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

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar cliente"}
        </Button>
      </div>
    </form>
  );
}
