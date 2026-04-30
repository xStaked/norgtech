import Link from "next/link";
import { apiFetch } from "@/lib/api.server";

interface ActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorName: string;
  createdAt: string;
}

interface DashboardSummary {
  openQuotes: number;
  pipelineValue: number;
  closedDeals: number;
  activeOrders: number;
  weeklyVisits: number;
  pendingFollowUps: number;
  recentActivity: ActivityItem[];
}

const kpiCards = [
  {
    key: "openQuotes" as const,
    label: "Cotizaciones abiertas",
    color: "#3498db",
  },
  {
    key: "pipelineValue" as const,
    label: "Valor pipeline",
    color: "#27ae60",
    format: (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`,
  },
  {
    key: "closedDeals" as const,
    label: "Ventas cerradas (30d)",
    color: "#9b59b6",
  },
  {
    key: "activeOrders" as const,
    label: "Pedidos activos",
    color: "#e67e22",
  },
  {
    key: "weeklyVisits" as const,
    label: "Visitas esta semana",
    color: "#1abc9c",
  },
  {
    key: "pendingFollowUps" as const,
    label: "Seguimientos pendientes",
    color: "#c0392b",
  },
];

const quickLinks = [
  { href: "/customers/new", label: "Nuevo cliente" },
  { href: "/opportunities/new", label: "Nueva oportunidad" },
  { href: "/quotes/new", label: "Nueva cotización" },
  { href: "/orders/new", label: "Nuevo pedido" },
];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DashboardPage() {
  const response = await apiFetch("/dashboard/summary");
  const summary: DashboardSummary | null = response.ok
    ? await response.json()
    : null;

  return (
    <div>
      <h1 style={{ margin: 0, marginBottom: "1.5rem" }}>Dashboard</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {kpiCards.map((card) => {
          const value = summary ? (summary[card.key] as number) : 0;
          return (
            <div
              key={card.key}
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "0.75rem",
                boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
                padding: "1.25rem",
                borderLeft: `4px solid ${card.color}`,
              }}
            >
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "#10233f",
                  lineHeight: 1.2,
                }}
              >
                {card.format ? card.format(value) : value}
              </div>
              <div
                style={{
                  fontSize: "0.875rem",
                  color: "#52637a",
                  marginTop: "0.25rem",
                }}
              >
                {card.label}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.125rem", margin: 0, marginBottom: "1rem", color: "#10233f" }}>
          Acceso rápido
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
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
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: "1.125rem", margin: 0, marginBottom: "1rem", color: "#10233f" }}>
          Actividad reciente
        </h2>
        {summary && summary.recentActivity.length > 0 ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {summary.recentActivity.map((item) => (
              <div
                key={item.id}
                style={{
                  backgroundColor: "#ffffff",
                  padding: "1rem 1.25rem",
                  borderRadius: "0.75rem",
                  boxShadow: "0 2px 8px rgba(16, 35, 63, 0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "0.25rem",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#10233f" }}>
                    {item.entityType} — {item.action}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#6b7c93", whiteSpace: "nowrap" }}>
                    {formatDateTime(item.createdAt)}
                  </div>
                </div>
                <div style={{ fontSize: "0.875rem", color: "#52637a", marginTop: "0.25rem" }}>
                  Usuario: {item.actorName}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "#52637a" }}>No hay actividad reciente.</p>
        )}
      </div>
    </div>
  );
}
