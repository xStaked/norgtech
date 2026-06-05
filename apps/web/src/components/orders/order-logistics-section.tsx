"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface User {
  id: string;
  name: string;
}

interface OrderLogisticsSectionProps {
  orderId: string;
  assignedLogisticsUser: User | null;
  committedDeliveryDate: string | null;
  dispatchDate: string | null;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  deliveryDate: string | null;
  deliveredToName: string | null;
  deliveryConfirmationNotes: string | null;
  logisticsNotes: string | null;
  canEdit: boolean;
}

export function OrderLogisticsSection({
  orderId,
  assignedLogisticsUser,
  committedDeliveryDate,
  dispatchDate,
  carrierName,
  trackingNumber,
  trackingUrl,
  deliveryDate,
  deliveredToName,
  deliveryConfirmationNotes,
  logisticsNotes,
  canEdit,
}: OrderLogisticsSectionProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    assignedLogisticsUserId: assignedLogisticsUser?.id ?? "",
    committedDeliveryDate: committedDeliveryDate ? committedDeliveryDate.slice(0, 10) : "",
    carrierName: carrierName ?? "",
    trackingNumber: trackingNumber ?? "",
    trackingUrl: trackingUrl ?? "",
    deliveredToName: deliveredToName ?? "",
    deliveryConfirmationNotes: deliveryConfirmationNotes ?? "",
    logisticsNotes: logisticsNotes ?? "",
  });

  async function handleSave() {
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetchClient(`/orders/${orderId}/logistics`, {
        method: "PATCH",
        body: JSON.stringify({
          assignedLogisticsUserId: form.assignedLogisticsUserId || undefined,
          committedDeliveryDate: form.committedDeliveryDate || undefined,
          carrierName: form.carrierName || undefined,
          trackingNumber: form.trackingNumber || undefined,
          trackingUrl: form.trackingUrl || undefined,
          deliveredToName: form.deliveredToName || undefined,
          deliveryConfirmationNotes: form.deliveryConfirmationNotes || undefined,
          logisticsNotes: form.logisticsNotes || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al actualizar logística");
        setLoading(false);
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Logística</h3>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-3 grid gap-4 rounded-xl border border-border bg-muted p-4 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
        {editing ? (
          <>
            <div className="grid gap-1">
              <Label className="text-sm font-semibold text-muted-foreground">
                Usuario asignado (ID)
              </Label>
              <Input
                value={form.assignedLogisticsUserId}
                onChange={(e) =>
                  setForm({ ...form, assignedLogisticsUserId: e.target.value })
                }
                placeholder="ID de usuario"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-sm font-semibold text-muted-foreground">
                Fecha comprometida
              </Label>
              <Input
                type="date"
                value={form.committedDeliveryDate}
                onChange={(e) =>
                  setForm({ ...form, committedDeliveryDate: e.target.value })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-sm font-semibold text-muted-foreground">
                Transportadora
              </Label>
              <Input
                value={form.carrierName}
                onChange={(e) => setForm({ ...form, carrierName: e.target.value })}
                placeholder="Transportadora"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-sm font-semibold text-muted-foreground">
                Número de guía
              </Label>
              <Input
                value={form.trackingNumber}
                onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
                placeholder="Guía"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-sm font-semibold text-muted-foreground">
                Link de tracking
              </Label>
              <Input
                value={form.trackingUrl}
                onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-sm font-semibold text-muted-foreground">
                Recibido por
              </Label>
              <Input
                value={form.deliveredToName}
                onChange={(e) => setForm({ ...form, deliveredToName: e.target.value })}
                placeholder="Nombre de quien recibe"
              />
            </div>
            <div className="col-span-full grid gap-1">
              <Label className="text-sm font-semibold text-muted-foreground">
                Confirmación de entrega
              </Label>
              <Textarea
                value={form.deliveryConfirmationNotes}
                onChange={(e) =>
                  setForm({ ...form, deliveryConfirmationNotes: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="col-span-full grid gap-1">
              <Label className="text-sm font-semibold text-muted-foreground">Notas</Label>
              <Textarea
                value={form.logisticsNotes}
                onChange={(e) =>
                  setForm({ ...form, logisticsNotes: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="col-span-full flex items-end gap-2">
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
            </div>
          </>
        ) : (
          <>
            <Info label="Usuario asignado" value={assignedLogisticsUser?.name ?? "Sin asignar"} />
            <Info
              label="Fecha comprometida"
              value={
                committedDeliveryDate
                  ? new Date(committedDeliveryDate).toLocaleDateString("es-CO")
                  : null
              }
            />
            <Info
              label="Fecha de despacho"
              value={dispatchDate ? new Date(dispatchDate).toLocaleDateString("es-CO") : null}
            />
            <Info label="Transportadora" value={carrierName} />
            <Info label="Número de guía" value={trackingNumber} />
            <TrackingInfo trackingUrl={trackingUrl} />
            <Info
              label="Fecha de entrega"
              value={deliveryDate ? new Date(deliveryDate).toLocaleDateString("es-CO") : null}
            />
            <Info label="Recibido por" value={deliveredToName} />
            {deliveryConfirmationNotes && (
              <div className="col-span-full">
                <div className="text-sm font-semibold text-muted-foreground">
                  Confirmación de entrega
                </div>
                <div className="mt-1 text-foreground">{deliveryConfirmationNotes}</div>
              </div>
            )}
            {logisticsNotes && (
              <div className="col-span-full">
                <div className="text-sm font-semibold text-muted-foreground">
                  Notas de logística
                </div>
                <div className="mt-1 text-foreground">{logisticsNotes}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TrackingInfo({ trackingUrl }: { trackingUrl: string | null | undefined }) {
  if (!trackingUrl) return null;
  return (
    <div>
      <div className="text-sm font-semibold text-muted-foreground">Tracking</div>
      <a
        href={trackingUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block max-w-full truncate text-primary underline-offset-4 hover:underline"
      >
        {trackingUrl}
      </a>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-foreground">{value}</div>
    </div>
  );
}
