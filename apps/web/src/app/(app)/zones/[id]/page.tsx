"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function ZoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zone, setZone] = useState<{
    name: string;
    department: string | null;
    isActive: boolean;
  } | null>(null);

  useEffect(() => {
    apiFetchClient(`/zones/${id}`)
      .then((r) => r.json())
      .then(setZone);
  }, [id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    const name = String(formData.get("name") ?? "").trim();
    const department = String(formData.get("department") ?? "").trim();
    if (name) body.name = name;
    if (department) body.department = department;
    body.isActive = formData.get("isActive") === "on";
    try {
      const res = await apiFetchClient(`/zones/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || "Error");
        setLoading(false);
        return;
      }
      router.push("/zones");
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  if (!zone) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Zonas"
        title={zone.name}
        actions={<ButtonLink href="/zones" variant="secondary">Volver</ButtonLink>}
      />
      <SectionCard>
        <form onSubmit={handleSubmit} className="grid gap-6 max-w-lg">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-1">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" defaultValue={zone.name} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="department">Departamento</Label>
            <Input
              id="department"
              name="department"
              defaultValue={zone.department ?? ""}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked={zone.isActive}
              className="h-4 w-4"
            />
            <Label htmlFor="isActive">Activa</Label>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Guardando..." : "Guardar cambios"}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
