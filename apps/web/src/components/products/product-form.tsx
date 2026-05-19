"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProductForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const body = {
      sku: String(formData.get("sku")),
      name: String(formData.get("name")),
      description: String(formData.get("description") || ""),
      unit: String(formData.get("unit")),
      presentation: String(formData.get("presentation") || ""),
      basePrice: Number(formData.get("basePrice")),
    };

    try {
      const response = await apiFetchClient("/products", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear el producto");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/products`);
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label>SKU *</Label>
        <Input name="sku" type="text" required />
      </div>

      <div className="grid gap-1">
        <Label>Nombre *</Label>
        <Input name="name" type="text" required />
      </div>

      <div className="grid gap-1">
        <Label>Descripción</Label>
        <Textarea name="description" rows={2} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Unidad *</Label>
          <Input
            name="unit"
            type="text"
            required
            placeholder="ej: kg, dosis, litro"
          />
        </div>
        <div className="grid gap-1">
          <Label>Presentación</Label>
          <Input
            name="presentation"
            type="text"
            placeholder="ej: Caja x10"
          />
        </div>
      </div>

      <div className="grid gap-1">
        <Label>Precio base *</Label>
        <Input
          name="basePrice"
          type="number"
          min={0}
          step={0.01}
          required
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar producto"}
        </Button>
      </div>
    </form>
  );
}
