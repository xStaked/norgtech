import Link from "next/link";
import { apiFetch } from "@/lib/api.server";

interface Customer {
  id: string;
  displayName: string;
}

interface Opportunity {
  id: string;
  title: string;
  stage: string;
  estimatedValue: string | null;
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

export default async function OpportunitiesPage() {
  const response = await apiFetch("/opportunities");
  const opportunities: Opportunity[] = response.ok ? await response.json() : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0 }}>Oportunidades</h1>
        <Link
          href="/opportunities/new"
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#10233f",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          Nueva oportunidad
        </Link>
      </div>

      {opportunities.length === 0 ? (
        <p style={{ color: "#52637a" }}>No hay oportunidades registradas.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {opportunities.map((opportunity) => (
            <Link
              key={opportunity.id}
              href={`/opportunities/${opportunity.id}`}
              style={{
                display: "block",
                backgroundColor: "#ffffff",
                padding: "1rem 1.25rem",
                borderRadius: "0.75rem",
                boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600, color: "#10233f" }}>
                  {opportunity.title}
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.5rem",
                    borderRadius: "0.25rem",
                    backgroundColor: stageColors[opportunity.stage] || "#6b7c93",
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {stageLabels[opportunity.stage] || opportunity.stage}
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                {opportunity.customer?.displayName}
                {opportunity.estimatedValue &&
                  ` · Valor estimado: $${Number(opportunity.estimatedValue).toLocaleString("es-CO")}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
