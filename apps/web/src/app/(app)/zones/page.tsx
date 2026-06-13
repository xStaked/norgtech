import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api.server";

interface Zone {
  id: string;
  name: string;
  department: string | null;
  isActive: boolean;
}

const columns: readonly DataTableColumn<Zone>[] = [
  {
    key: "name",
    header: "Nombre",
    render: (row) => (
      <Link href={`/zones/${row.id}`} className="font-bold text-foreground no-underline">
        {row.name}
      </Link>
    ),
  },
  {
    key: "department",
    header: "Departamento",
    render: (row) => row.department || "—",
  },
  {
    key: "status",
    header: "Estado",
    render: (row) => (
      <StatusBadge tone={row.isActive ? "success" : "neutral"}>
        {row.isActive ? "Activa" : "Inactiva"}
      </StatusBadge>
    ),
  },
] as const;

export default async function ZonesPage() {
  const response = await apiFetch("/zones");
  const zones: Zone[] = response.ok ? await response.json() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogo"
        title="Zonas"
        description="Zonas de despacho para pedidos y analisis territorial."
        actions={<ButtonLink href="/zones/new">Nueva zona</ButtonLink>}
      />
      <FilterBar summary={`${zones.length.toLocaleString("es-CO")} zonas registradas`} />
      <SectionCard title="Catalogo de zonas" description="Gestiona las zonas disponibles para asignar a clientes.">
        <DataTable
          columns={columns}
          rows={zones}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No hay zonas registradas"
              description="Crea la primera zona para empezar a asignarlas a clientes."
              action={<ButtonLink href="/zones/new">Crear zona</ButtonLink>}
            />
          }
        />
      </SectionCard>
    </div>
  );
}
