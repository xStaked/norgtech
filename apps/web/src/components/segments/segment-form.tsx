"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-section";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  discountPercent: number;
  minGoalAmount: number;
  maxGoalAmount: number | null;
  active: boolean;
}

interface SegmentFormProps {
  segment?: Segment;
}

export function SegmentForm({ segment }: SegmentFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isEditing = !!segment;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name"));
    const description = String(formData.get("description") || "");
    const discountPercent = Number(formData.get("discountPercent"));
    const minGoalAmount = Number(formData.get("minGoalAmount"));
    const maxGoalAmountRaw = formData.get("maxGoalAmount");
    const maxGoalAmount = maxGoalAmountRaw ? Number(maxGoalAmountRaw) : null;

    const body = {
      name,
      description: description || null,
      discountPercent,
      minGoalAmount,
      maxGoalAmount,
    };

    try {
      const url = isEditing
        ? `/customer-segments/${segment.id}`
        : "/customer-segments";
      const method = isEditing ? "PATCH" : "POST";

      const response = await apiFetchClient(url, {
        method,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || `Error al ${isEditing ? "actualizar" : "crear"} el segmento`);
        setLoading(false);
        return;
      }

      router.push("/segments");
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <FormSection
        title="Información del segmento"
        description="Define el nombre, descuento y rangos de metas."
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={segment?.name ?? ""}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={segment?.description ?? ""}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="discountPercent">Descuento (%) *</Label>
            <Input
              id="discountPercent"
              name="discountPercent"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              defaultValue={segment?.discountPercent ?? ""}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="minGoalAmount">Meta mínima ($) *</Label>
              <Input
                id="minGoalAmount"
                name="minGoalAmount"
                type="number"
                step={1}
                min={0}
                required
                defaultValue={segment?.minGoalAmount ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="maxGoalAmount">Meta máxima ($)</Label>
              <Input
                id="maxGoalAmount"
                name="maxGoalAmount"
                type="number"
                step={1}
                min={0}
                placeholder="Dejar vacío para sin límite"
                defaultValue={segment?.maxGoalAmount ?? ""}
              />
            </div>
          </div>
        </div>
      </FormSection>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? "Guardando..."
            : isEditing
              ? "Guardar cambios"
              : "Guardar segmento"}
        </Button>
      </div>
    </form>
  );
}
