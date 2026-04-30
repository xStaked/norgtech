import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { crmTheme, type CrmStatusTone } from "@/components/ui/theme";
import { apiFetch } from "@/lib/api.server";

interface ActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorName: string;
  createdAt: string;
}

interface QueueItem {
  id: string;
  kind: "task" | "visit";
  title: string;
  customerName: string;
  scheduledAt: string;
  status: string;
}

interface DashboardSummary {
  openQuotes: number;
  pipelineValue: number;
  closedDeals: number;
  activeOrders: number;
  weeklyVisits: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  todayVisits: number;
  myQueue: QueueItem[];
  recentActivity: ActivityItem[];
}

const kpiCards = [
  { key: "openQuotes" as const, label: "Cotizaciones abiertas", tone: "info" as const },
  { key: "pipelineValue" as const, label: "Valor pipeline", tone: "success" as const },
  { key: "closedDeals" as const, label: "Ventas cerradas 30d", tone: "success" as const },
  { key: "activeOrders" as const, label: "Pedidos activos", tone: "warning" as const },
  { key: "weeklyVisits" as const, label: "Visitas esta semana", tone: "info" as const },
  { key: "pendingFollowUps" as const, label: "Seguimientos pendientes", tone: "danger" as const },
] as const;

const quickLinks = [
  { href: "/customers/new", label: "Nuevo cliente" },
  { href: "/opportunities/new", label: "Nueva oportunidad" },
  { href: "/quotes/new", label: "Nueva cotización" },
  { href: "/orders/new", label: "Nuevo pedido" },
] as const;

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatKpiValue(
  summary: DashboardSummary | null,
  key: (typeof kpiCards)[number]["key"],
) {
  const value = summary?.[key] ?? 0;

  if (key === "pipelineValue") {
    return currencyFormatter.format(Math.round(value));
  }

  return value.toLocaleString("es-CO");
}

const queueStatusTone: Record<string, CrmStatusTone> = {
  programada: "warning",
  pendiente: "warning",
  vencida: "danger",
  completada: "success",
  no_realizada: "neutral",
  cancelada: "danger",
};

export default async function DashboardPage() {
  const response = await apiFetch("/dashboard/summary");
  const summary: DashboardSummary | null = response.ok ? await response.json() : null;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <PageHeader
        eyebrow="Centro operativo"
        title="Dashboard operativo"
        description="Resumen comercial, actividad reciente y próximas acciones del equipo."
        actions={
          <>
            <ButtonLink href="/opportunities/new">Nueva oportunidad</ButtonLink>
            <ButtonLink href="/agenda" variant="secondary">
              Ver agenda
            </ButtonLink>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {kpiCards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            tone={card.tone}
            value={formatKpiValue(summary, card.key)}
          />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)",
          gap: 16,
        }}
      >
        <SectionCard
          title="Actividad reciente"
          description="Eventos relevantes generados por cotizaciones, pedidos, visitas y seguimiento."
        >
          {summary && summary.recentActivity.length > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              {summary.recentActivity.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gap: 6,
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "rgba(238, 243, 248, 0.62)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>{item.entityType} · {item.action}</strong>
                    <span style={{ color: "#6b7c93", fontSize: 13 }}>
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <span style={{ color: "#52637a", fontSize: 14 }}>
                    Usuario: {item.actorName}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sin actividad reciente"
              description="Cuando el equipo registre movimientos comerciales, aparecerán aquí."
            />
          )}
        </SectionCard>

        <div style={{ display: "grid", gap: 16 }}>
          <SectionCard
            title="Mi cola de trabajo"
            description="Próximas visitas y tareas asignadas a ti, ordenadas por urgencia."
            actions={
              <ButtonLink href="/agenda" variant="ghost" size="sm">
                Ver agenda
              </ButtonLink>
            }
          >
            {summary && summary.myQueue.length > 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                {summary.myQueue.map((item) => {
                  const href = item.kind === "visit" ? `/visits/${item.id}` : `/follow-ups/${item.id}`;
                  return (
                    <Link
                      key={`${item.kind}-${item.id}`}
                      href={href}
                      style={{
                        display: "grid",
                        gap: 8,
                        padding: "12px 14px",
                        borderRadius: crmTheme.radius.md,
                        background: crmTheme.colors.surfaceMuted,
                        border: `1px solid ${crmTheme.colors.border}`,
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: item.kind === "visit" ? crmTheme.colors.info : crmTheme.colors.textMuted }}>
                          {item.kind === "visit" ? "Visita" : "Seguimiento"}
                        </span>
                        <StatusBadge tone={queueStatusTone[item.status] ?? "neutral"}>
                          {item.status.replace(/_/g, " ")}
                        </StatusBadge>
                      </div>
                      <strong style={{ fontSize: 14, color: crmTheme.colors.text }}>{item.title}</strong>
                      <span style={{ fontSize: 13, color: crmTheme.colors.textMuted }}>{item.customerName}</span>
                      <span style={{ fontSize: 12, color: crmTheme.colors.textSubtle }}>{timeFormatter.format(new Date(item.scheduledAt))}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="Sin elementos asignados"
                description="No tienes visitas ni tareas pendientes asignadas a tu usuario."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Acciones rápidas"
            description="Atajos a los flujos que más se repiten en la operación diaria."
          >
            <div style={{ display: "grid", gap: 10 }}>
              {quickLinks.map((link) => (
                <ButtonLink
                  key={link.href}
                  href={link.href}
                  variant="secondary"
                  style={{ justifyContent: "space-between" }}
                  trailing={<span aria-hidden="true">›</span>}
                >
                  {link.label}
                </ButtonLink>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
