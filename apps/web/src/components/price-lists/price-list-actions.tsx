"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchClient } from "@/lib/api.client";

export function PriceListActions({ listId, listName, active }: { listId: string; listName: string; active: boolean }) {
  const router = useRouter();
  const [cloning, setCloning] = useState(false);
  const [cloneName, setCloneName] = useState(`${listName} copia`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function readError(res: Response, fallback: string) {
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (typeof data.message === "string") return data.message;
      if (Array.isArray(data.message)) return data.message.join(", ");
    } catch {
      // keep fallback
    }
    return fallback;
  }

  async function handleClone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetchClient(`/price-lists/${listId}/clone`, {
        method: "POST",
        body: JSON.stringify({ name: cloneName.trim() }),
      });
      if (!res.ok) throw new Error(await readError(res, "clonar la lista"));
      const data = (await res.json()) as { id: string };
      router.push(`/price-lists/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
      setBusy(false);
    }
  }

  async function toggleActive() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetchClient(`/price-lists/${listId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !active }),
      });
      if (!res.ok) throw new Error(await readError(res, "actualizar la lista"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setCloning((v) => !v)}>
          Clonar
        </Button>
        <Button type="button" variant={active ? "destructive" : "default"} onClick={() => void toggleActive()} disabled={busy}>
          {active ? "Desactivar lista" : "Activar lista"}
        </Button>
      </div>
      {cloning ? (
        <form onSubmit={(e) => void handleClone(e)} className="grid gap-2 rounded-lg border border-border p-3">
          <Label htmlFor="clone-name">Nombre de la copia</Label>
          <Input id="clone-name" value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
          <div>
            <Button type="submit" disabled={busy}>
              Crear copia
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
