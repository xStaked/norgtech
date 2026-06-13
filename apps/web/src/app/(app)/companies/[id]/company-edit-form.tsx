"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Company {
  id: string;
  name: string;
  legalName: string;
  nit: string;
  prefix: string;
  isActive: boolean;
}

export function CompanyEditForm({ company }: { company: Company }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const body: Record<string, unknown> = {};
    const name = String(formData.get("name") ?? "").trim();
    const legalName = String(formData.get("legalName") ?? "").trim();
    const nit = String(formData.get("nit") ?? "").trim();
    const prefix = String(formData.get("prefix") ?? "").trim().toUpperCase();

    if (name) body.name = name;
    if (legalName) body.legalName = legalName;
    if (nit) body.nit = nit;
    if (prefix) body.prefix = prefix;
    body.isActive = formData.get("isActive") === "on";

    try {
      const response = await apiFetchClient(`/companies/${company.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al actualizar la empresa");
        setLoading(false);
        return;
      }

      router.refresh();
      router.push("/companies");
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 max-w-lg">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={company.name} />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="legalName">Razon social</Label>
        <Input id="legalName" name="legalName" defaultValue={company.legalName} />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="nit">NIT</Label>
        <Input id="nit" name="nit" defaultValue={company.nit} />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="prefix">Prefijo (2-4 letras mayusculas)</Label>
        <Input id="prefix" name="prefix" defaultValue={company.prefix} maxLength={4} minLength={2} />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="isActive" name="isActive" defaultChecked={company.isActive} className="h-4 w-4" />
        <Label htmlFor="isActive">Activa</Label>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
