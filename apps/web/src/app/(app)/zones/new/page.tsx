"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function NewZonePage() {
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
      department: String(formData.get("department") ?? "").trim() || undefined,
    };
    if (!body.name) {
      setError("El nombre es obligatorio");
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetchClient("/zones", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || "Error");
        setLoading(false);
        return;
      }
      const created = await res.json();
      router.push(`/zones/${created.id}`);
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Zonas"
        title="Nueva zona"
        actions={<ButtonLink href="/zones" variant="secondary">Volver</ButtonLink>}
      />
      <SectionCard>
        <form onSubmit={handleSubmit} className="grid gap-6 max-w-lg">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-1">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" name="name" required placeholder="Costa" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="department">Departamento</Label>
            <Input id="department" name="department" placeholder="Atlantico" />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Guardando..." : "Guardar zona"}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
