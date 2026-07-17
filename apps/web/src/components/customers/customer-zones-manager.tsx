"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchClient } from "@/lib/api.client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import { SectionCard } from "@/components/ui/section-card";
import { ZoneSelect } from "@/components/zones/zone-select";
import { UserSelect } from "@/components/users/user-select";

interface CustomerZone {
  id: string;
  zone: { id: string; name: string };
  address: string | null;
  assignedTo: { id: string; name: string } | null;
}

interface CustomerZonesManagerProps {
  customerId: string;
  zones: CustomerZone[];
  canAssign: boolean;
}

// CLI-04 + CLI-05 + ORD-06 (causa compartida): antes no habia UI para asignar
// zonas de despacho a un cliente, asi que la seccion del detalle (CLI-05) y el
// selector del formulario de pedido (ORD-06) nunca se poblaban. La asignacion
// vive en el DETALLE porque POST /customers/:id/zones necesita un id existente.
export function CustomerZonesManager({
  customerId,
  zones,
  canAssign,
}: CustomerZonesManagerProps) {
  const router = useRouter();
  const [zoneId, setZoneId] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!zoneId) return;
    setError(null);
    setLoading(true);

    try {
      const response = await apiFetchClient(`/customers/${customerId}/zones`, {
        method: "POST",
        body: JSON.stringify({
          zoneId,
          address: address.trim() || undefined,
          assignedToUserId: assignedToUserId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.message || "Error al asignar la zona");
        setLoading(false);
        return;
      }

      setZoneId("");
      setAssignedToUserId("");
      setAddress("");
      setLoading(false);
      router.refresh();
    } catch {
      setError("Error de conexion");
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Zonas de despacho"
      description="Zonas asignadas a este cliente con vendedor por zona."
    >
      {zones.length > 0 ? (
        <DataTable
          columns={[
            { key: "zone", header: "Zona", render: (r: CustomerZone) => r.zone.name },
            { key: "address", header: "Direccion", render: (r: CustomerZone) => r.address || "—" },
            { key: "seller", header: "Vendedor", render: (r: CustomerZone) => r.assignedTo?.name || "—" },
          ]}
          rows={zones}
          getRowKey={(r) => r.id}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Sin zonas asignadas.</p>
      )}

      {canAssign && (
        <form onSubmit={handleAssign} className="mt-4 grid gap-3 border-t border-border/60 pt-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label>Zona *</Label>
              <ZoneSelect value={zoneId} onChange={setZoneId} required />
            </div>
            <div className="grid gap-1">
              <Label>Vendedor</Label>
              <UserSelect value={assignedToUserId} onChange={setAssignedToUserId} />
            </div>
            <div className="grid gap-1">
              <Label>Direccion</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <div>
            <Button type="submit" size="sm" disabled={loading || !zoneId}>
              {loading ? "Asignando..." : "Asignar zona"}
            </Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
