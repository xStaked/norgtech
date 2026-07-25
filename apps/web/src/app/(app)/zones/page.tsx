import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/ui/list-filters";
import { applyFilters, optionsFrom, type SearchParams } from "@/lib/list-filter";
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

export default async function ZonesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const response = await apiFetch("/zones?includeInactive=true");
  const zones: Zone[] = response.ok ? await response.json() : [];

  const filtered = applyFilters(zones, params, {
    search: (zone) => [zone.name, zone.department],
    match: {
      department: (zone) => zone.department,
      active: (zone) => String(zone.isActive),
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogo"
        title="Zonas"
        description="Zonas de despacho para pedidos y analisis territorial."
        actions={<ButtonLink href="/zones/new">Nueva zona</ButtonLink>}
      />
      <ListFilters
        searchPlaceholder="Buscar por nombre o departamento"
        selects={[
          {
            key: "department",
            allLabel: "Todos los departamentos",
            options: optionsFrom(zones, (zone) => zone.department),
          },
          {
            key: "active",
            allLabel: "Todos los estados",
            options: [
              { value: "true", label: "Activas" },
              { value: "false", label: "Inactivas" },
            ],
          },
        ]}
        shown={filtered.length}
        total={zones.length}
        noun="zonas"
      />
      <SectionCard title="Catalogo de zonas" description="Gestiona las zonas disponibles para asignar a clientes.">
        <DataTable
          columns={columns}
          rows={filtered}
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
