"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetchClient } from "@/lib/api.client";

export function SpecialPriceListReviewActions({
  listId,
  revisionId,
  status,
  canSubmit,
  canReview,
}: {
  listId: string;
  revisionId: string;
  status: string;
  canSubmit: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetchClient(path, { method, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) throw new Error("No se pudo actualizar la revisión");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
      {canSubmit && (status === "borrador" || status === "rechazada") ? (
        <Button disabled={busy} onClick={() => void call(`/special-price-lists/${listId}/revisions/${revisionId}/submit`, "POST")}>
          Enviar a revisión
        </Button>
      ) : null}
      {canReview && status === "en_revision" ? (
        <>
          <Button disabled={busy} onClick={() => void call(`/special-price-lists/${listId}/revisions/${revisionId}/approval`, "PATCH", { action: "aprobar" })}>
            Aprobar
          </Button>
          <Button disabled={busy} variant="destructive" onClick={() => void call(`/special-price-lists/${listId}/revisions/${revisionId}/approval`, "PATCH", { action: "rechazar" })}>
            Rechazar
          </Button>
        </>
      ) : null}
    </div>
  );
}
