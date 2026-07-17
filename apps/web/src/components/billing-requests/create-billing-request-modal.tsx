"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CompanySelect } from "@/components/companies/company-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreateBillingRequestModalProps {
  customers: Array<{ id: string; displayName: string }>;
}

export function CreateBillingRequestModal({ customers }: CreateBillingRequestModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Empresa emisora: el DTO la exige y el JWT no la lleva, asi que el servidor
  // no puede derivarla. Se elige igual que en el pedido (BILL-01/BILL-02).
  const [companyId, setCompanyId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [sourceOrderId, setSourceOrderId] = useState("");
  const [sourceQuoteId, setSourceQuoteId] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyId) {
      setError("Debes seleccionar una empresa facturadora.");
      return;
    }

    if (!customerId) {
      setError("Debes seleccionar un cliente.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = { companyId, customerId };
      if (sourceOrderId) body.sourceOrderId = sourceOrderId;
      if (sourceQuoteId) body.sourceQuoteId = sourceQuoteId;
      if (notes) body.notes = notes;

      const response = await apiFetchClient("/billing-requests", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al crear solicitud");
        setLoading(false);
        return;
      }
      setOpen(false);
      setCompanyId("");
      setCustomerId("");
      setSourceOrderId("");
      setSourceQuoteId("");
      setNotes("");
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Crear solicitud</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva solicitud de facturación</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid gap-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="grid gap-2">
              <Label htmlFor="companyId">Empresa facturadora *</Label>
              <CompanySelect value={companyId} onChange={setCompanyId} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="customerId">Cliente *</Label>
              <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                <SelectTrigger id="customerId">
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sourceOrderId">Pedido origen (opcional)</Label>
              <Input
                id="sourceOrderId"
                value={sourceOrderId}
                onChange={(e) => setSourceOrderId(e.target.value)}
                placeholder="ID del pedido"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sourceQuoteId">Cotización origen (opcional)</Label>
              <Input
                id="sourceQuoteId"
                value={sourceQuoteId}
                onChange={(e) => setSourceQuoteId(e.target.value)}
                placeholder="ID de la cotización"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
