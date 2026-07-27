"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserSelect } from "@/components/users/user-select";

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
    // ponytail: mismas clases que el Card/CardHeader/Info del detalle de pedido,
    // que es con quien tiene que verse igual. Si esos tres suben a un componente
    // compartido, esta seccion se cuelga de el.
    <section className="rounded-[11px] border border-[#e4e7ec] bg-white p-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[14.5px] font-extrabold text-[#0c2c44]">Logística</h2>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}

      {editing ? (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Usuario asignado" htmlFor="assignedLogisticsUserId">
              <UserSelect
                id="assignedLogisticsUserId"
                name="assignedLogisticsUserId"
                endpoint="/users/logistics"
                searchPlaceholder="Buscar usuario…"
                value={form.assignedLogisticsUserId}
                onChange={(assignedLogisticsUserId) =>
                  setForm({ ...form, assignedLogisticsUserId })
                }
              />
            </Field>
            <Field label="Fecha comprometida" htmlFor="committedDeliveryDate">
              <Input
                id="committedDeliveryDate"
                type="date"
                value={form.committedDeliveryDate}
                onChange={(e) =>
                  setForm({ ...form, committedDeliveryDate: e.target.value })
                }
              />
            </Field>
            <Field label="Transportadora" htmlFor="carrierName">
              <Input
                id="carrierName"
                value={form.carrierName}
                onChange={(e) => setForm({ ...form, carrierName: e.target.value })}
              />
            </Field>
            <Field label="Número de guía" htmlFor="trackingNumber">
              <Input
                id="trackingNumber"
                value={form.trackingNumber}
                onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
              />
            </Field>
            <Field label="Link de tracking" htmlFor="trackingUrl">
              <Input
                id="trackingUrl"
                value={form.trackingUrl}
                onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })}
                placeholder="https://..."
              />
            </Field>
            <Field label="Recibido por" htmlFor="deliveredToName">
              <Input
                id="deliveredToName"
                value={form.deliveredToName}
                onChange={(e) => setForm({ ...form, deliveredToName: e.target.value })}
                placeholder="Nombre de quien recibe"
              />
            </Field>
          </div>
          <Field label="Confirmación de entrega" htmlFor="deliveryConfirmationNotes">
            <Textarea
              id="deliveryConfirmationNotes"
              value={form.deliveryConfirmationNotes}
              onChange={(e) =>
                setForm({ ...form, deliveryConfirmationNotes: e.target.value })
              }
              rows={2}
            />
          </Field>
          <Field label="Notas" htmlFor="logisticsNotes">
            <Textarea
              id="logisticsNotes"
              value={form.logisticsNotes}
              onChange={(e) => setForm({ ...form, logisticsNotes: e.target.value })}
              rows={2}
            />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={loading}>
              {loading ? "Guardando..." : "Guardar"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Info label="Usuario asignado" value={assignedLogisticsUser?.name ?? "Sin asignar"} />
          <Info label="Fecha comprometida" value={formatDate(committedDeliveryDate)} />
          <Info label="Fecha de despacho" value={formatDate(dispatchDate)} />
          <Info label="Transportadora" value={carrierName} />
          <Info label="Número de guía" value={trackingNumber} />
          <Info
            label="Tracking"
            value={
              trackingUrl ? (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block max-w-full truncate text-primary underline-offset-4 hover:underline"
                >
                  {trackingUrl}
                </a>
              ) : null
            }
          />
          <Info label="Fecha de entrega" value={formatDate(deliveryDate)} />
          <Info label="Recibido por" value={deliveredToName} />
          <div className="sm:col-span-2">
            <Info label="Confirmación de entrega" value={deliveryConfirmationNotes} />
          </div>
          <div className="sm:col-span-2">
            <Info label="Notas de logística" value={logisticsNotes} />
          </div>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("es-CO") : null;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[#9aa3b1]">
        {label}
      </div>
      <div className="mt-0.5 text-[13px] text-[#3a4658]">{value}</div>
    </div>
  );
}
