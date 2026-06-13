"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CompanyForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const body = {
      name: String(formData.get("name") ?? "").trim(),
      legalName: String(formData.get("legalName") ?? "").trim(),
      nit: String(formData.get("nit") ?? "").trim(),
      prefix: String(formData.get("prefix") ?? "").trim().toUpperCase(),
    };

    if (!body.name || !body.legalName || !body.nit || !body.prefix) {
      setError("Todos los campos son obligatorios");
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetchClient("/companies", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la empresa");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/companies/${created.id}`);
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 max-w-lg">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label htmlFor="name">Nombre *</Label>
        <Input id="name" name="name" required placeholder="Norgtech" />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="legalName">Razon social *</Label>
        <Input id="legalName" name="legalName" required placeholder="Tecnologia de Nutricion Organica S.A.S." />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="nit">NIT *</Label>
        <Input id="nit" name="nit" required placeholder="900.123.456-7" />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="prefix">Prefijo * (2-4 letras mayusculas)</Label>
        <Input
          id="prefix"
          name="prefix"
          required
          maxLength={4}
          minLength={2}
          placeholder="NT"
          style={{ textTransform: "uppercase" }}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar empresa"}
        </Button>
      </div>
    </form>
  );
}
