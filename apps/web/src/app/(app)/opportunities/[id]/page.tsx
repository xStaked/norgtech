import Link from "next/link";
import { notFound } from "next/navigation";
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
  prospecto: "#6b7c93",
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
    <div>
      <Link
        href="/opportunities"
        style={{
          fontSize: "0.875rem",
          color: "#52637a",
          textDecoration: "none",
          marginBottom: "1rem",
          display: "inline-block",
        }}
      >
        ← Volver a oportunidades
      </Link>

      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "1.5rem",
          borderRadius: "0.75rem",
          boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1 style={{ margin: 0 }}>{opportunity.title}</h1>
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              padding: "0.375rem 0.75rem",
              borderRadius: "0.375rem",
              backgroundColor: stageColors[opportunity.stage] || "#6b7c93",
              color: "#ffffff",
            }}
          >
            {stageLabels[opportunity.stage] || opportunity.stage}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
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
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7c93" }}>{label}</div>
      <div style={{ marginTop: "0.25rem", color: "#10233f" }}>{value}</div>
    </div>
  );
}
