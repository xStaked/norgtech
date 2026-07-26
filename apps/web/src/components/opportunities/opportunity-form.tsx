"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface Customer {
  id: string;
  displayName: string;
}

interface OpportunityFormProps {
  customers: Customer[];
}

const stages = [
  { value: "prospecto", label: "Prospecto" },
  { value: "contacto", label: "Contacto" },
  { value: "visita", label: "Visita" },
  { value: "cotizacion", label: "Cotización" },
  { value: "negociacion", label: "Negociación" },
  { value: "orden_facturacion", label: "Orden de facturación" },
  { value: "venta_cerrada", label: "Venta cerrada" },
  { value: "perdida", label: "Perdida" },
];

export function OpportunityForm({ customers }: OpportunityFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("prospecto");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const lostReasonRaw = String(formData.get("lostReason") ?? "").trim();

    const body = {
      customerId: String(formData.get("customerId")),
      title: String(formData.get("title")),
      stage: String(formData.get("stage")),
      estimatedValue: formData.get("estimatedValue")
        ? Number(formData.get("estimatedValue"))
        : undefined,
      // OPP-02: solo se envia cuando la etapa es `perdida`; en cualquier otro
      // caso queda undefined y JSON.stringify lo omite (el backend rechaza
      // campos no permitidos con forbidNonWhitelisted).
      lostReason:
        formData.get("stage") === "perdida" && lostReasonRaw
          ? lostReasonRaw
          : undefined,
    };

    try {
      const response = await apiFetchClient("/opportunities", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear la oportunidad");
        setLoading(false);
        return;
      }

      const created = await response.json();
      router.push(`/opportunities/${created.id}`);
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1">
        <Label>Cliente *</Label>
        <Select
          name="customerId"
          required
          searchPlaceholder="Buscar cliente…"
          options={[
            { value: "", label: "Seleccionar cliente" },
            ...customers.map((c) => ({ value: c.id, label: c.displayName })),
          ]}
        />
      </div>

      <div className="grid gap-1">
        <Label>Título *</Label>
        <Input
          name="title"
          type="text"
          required
          aria-label="Titulo"
        />
      </div>

      <div className="grid gap-1">
        <Label>Etapa *</Label>
        <Select name="stage" required value={stage} onValueChange={setStage} options={stages} />
      </div>

      {stage === "perdida" && (
        <div className="grid gap-1">
          <Label>Motivo de pérdida</Label>
          <Input
            name="lostReason"
            type="text"
            aria-label="Motivo de perdida"
            placeholder="Ej: precio, competencia, sin presupuesto"
          />
        </div>
      )}

      <div className="grid gap-1">
        <Label>Valor estimado</Label>
        <Input
          name="estimatedValue"
          type="number"
          min={0}
          step={0.01}
          aria-label="Valor estimado"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Guardando..." : "Guardar oportunidad"}
        </Button>
      </div>
    </form>
  );
}
