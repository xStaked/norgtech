import Link from "next/link";
import { notFound } from "next/navigation";
import { NoraContextLauncher } from "@/components/nora/nora-context-launcher";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
  legalName: string;
}

interface Opportunity {
  id: string;
  title: string;
  stage: string;
  estimatedValue: string | null;
  expectedCloseDate: string | null;
  lostReason: string | null;
  closedAt: string | null;
  customer: Customer | null;
  createdAt: string;
}

const stageLabels: Record<string, string> = {
  prospecto: "Prospecto",
  contacto: "Contacto",
  visita: "Visita",
  cotizacion: "Cotización",
  negociacion: "Negociación",
  orden_facturacion: "Orden de facturación",
  venta_cerrada: "Venta cerrada",
  perdida: "Perdida",
};

const stageColors: Record<string, string> = {
  prospecto: "#6b7787",
  contacto: "#3498db",
  visita: "#9b59b6",
  cotizacion: "#f39c12",
  negociacion: "#e67e22",
  orden_facturacion: "#1abc9c",
  venta_cerrada: "#27ae60",
  perdida: "#c0392b",
};

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const response = await apiFetch(`/opportunities/${id}`);

  if (!response.ok) {
    notFound();
  }

  const opportunity: Opportunity = await response.json();

  return (
    <div className="grid gap-6">
      <Link
        href="/opportunities"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Volver a oportunidades
      </Link>

      <PageHeader
        title={opportunity.title}
        eyebrow={stageLabels[opportunity.stage] || opportunity.stage}
        actions={
          <span
            className="inline-flex items-center rounded-md px-3 py-1 text-sm font-semibold text-white"
            style={{
              backgroundColor: stageColors[opportunity.stage] || "#6b7787",
            }}
          >
            {stageLabels[opportunity.stage] || opportunity.stage}
          </span>
        }
      />

      <SectionCard>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
          <Info label="Cliente" value={opportunity.customer?.displayName} />
          <Info
            label="Valor estimado"
            value={
              opportunity.estimatedValue
                ? `$${Number(opportunity.estimatedValue).toLocaleString("es-CO")}`
                : null
            }
          />
          <Info
            label="Fecha de cierre esperada"
            value={
              opportunity.expectedCloseDate
                ? new Date(opportunity.expectedCloseDate).toLocaleDateString("es-CO")
                : null
            }
          />
          <Info
            label="Fecha de cierre"
            value={
              opportunity.closedAt
                ? new Date(opportunity.closedAt).toLocaleDateString("es-CO")
                : null
            }
          />
          {opportunity.lostReason && (
            <Info label="Motivo de pérdida" value={opportunity.lostReason} />
          )}
        </div>
      </SectionCard>

      <NoraContextLauncher
        contextType="opportunity"
        contextEntityId={opportunity.id}
        contextLabel={opportunity.title}
      />
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
