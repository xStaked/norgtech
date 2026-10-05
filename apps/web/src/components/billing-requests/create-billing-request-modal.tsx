"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CompanySelect } from "@/components/companies/company-select";
import { Select } from "@/components/ui/select";
import {
  orderOptionsForCustomer,
  quoteOptionsForCustomer,
  type OriginOrder,
  type OriginQuote,
} from "@/lib/origin-select";

interface CreateBillingRequestModalProps {
  customers: Array<{ id: string; displayName: string }>;
  orders: OriginOrder[];
  quotes: OriginQuote[];
}

export function CreateBillingRequestModal({ customers, orders, quotes }: CreateBillingRequestModalProps) {
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

  const customerOrders = useMemo(
    () => orderOptionsForCustomer(orders, customerId),
    [orders, customerId],
  );
  const customerQuotes = useMemo(
    () => quoteOptionsForCustomer(quotes, customerId),
    [quotes, customerId],
  );

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
        const data = (await response.json().catch(() => ({}))) as { message?: string };
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

          <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="grid gap-2">
              <Label htmlFor="companyId">Empresa facturadora *</Label>
              <CompanySelect value={companyId} onChange={setCompanyId} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="customerId">Cliente *</Label>
              <Select
                id="customerId"
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(value);
                  setSourceOrderId("");
                  setSourceQuoteId("");
                }}
                placeholder="Seleccionar cliente"
                searchPlaceholder="Buscar cliente…"
                options={customers.map((c) => ({ value: c.id, label: c.displayName }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sourceOrderId">Pedido origen (opcional)</Label>
              <Select
                id="sourceOrderId"
                value={sourceOrderId}
                onValueChange={(value) => {
                  setSourceOrderId(value);
                  if (value) setSourceQuoteId("");
                }}
                disabled={!customerId}
                hint={customerId ? "Solo pedidos de este cliente. Al elegir pedido se limpia la cotización." : "Elige primero un cliente."}
                placeholder="Sin pedido"
                searchPlaceholder="Buscar pedido…"
                options={[{ value: "", label: "Sin pedido" }, ...customerOrders]}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sourceQuoteId">Cotización origen (opcional)</Label>
              <Select
                id="sourceQuoteId"
                value={sourceQuoteId}
                onValueChange={(value) => {
                  setSourceQuoteId(value);
                  if (value) setSourceOrderId("");
                }}
                disabled={!customerId}
                hint={customerId ? "Solo cotizaciones de este cliente. Al elegir cotización se limpia el pedido." : "Elige primero un cliente."}
                placeholder="Sin cotización"
                searchPlaceholder="Buscar cotización…"
                options={[{ value: "", label: "Sin cotización" }, ...customerQuotes]}
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
