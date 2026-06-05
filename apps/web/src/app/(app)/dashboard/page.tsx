import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ShiftKpiCard } from "@/components/dashboard/shift-kpi-card";
import { ActivityList } from "@/components/dashboard/activity-list";
import { QueueList } from "@/components/dashboard/queue-list";
import { FeedbackWidget } from "@/components/dashboard/feedback-widget";
import { CustomerGoalsDashboard } from "@/components/dashboard/customer-goals-dashboard";
import {
  CommercialAdvancedDashboard,
  type CommercialAdvancedSummary,
} from "@/components/dashboard/commercial-advanced-dashboard";
import { apiFetch } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/auth.server";
import { canCreate } from "@/lib/auth";
import {
  FileText,
  TrendingUp,
  DollarSign,
  Package,
  CalendarDays,
  AlertCircle,
  ArrowRight,
  Zap,
  Users,
  Briefcase,
  ShoppingCart,
} from "lucide-react";

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

const kpiConfig = [
  { key: "openQuotes" as const, label: "Cotizaciones abiertas", tone: "info" as const, icon: <FileText className="h-5 w-5" /> },
  { key: "pipelineValue" as const, label: "Valor pipeline", tone: "success" as const, icon: <TrendingUp className="h-5 w-5" /> },
  { key: "closedDeals" as const, label: "Ventas cerradas 30d", tone: "success" as const, icon: <DollarSign className="h-5 w-5" /> },
  { key: "activeOrders" as const, label: "Pedidos activos", tone: "warning" as const, icon: <Package className="h-5 w-5" /> },
  { key: "weeklyVisits" as const, label: "Visitas esta semana", tone: "info" as const, icon: <CalendarDays className="h-5 w-5" /> },
  { key: "pendingFollowUps" as const, label: "Seguimientos pendientes", tone: "danger" as const, icon: <AlertCircle className="h-5 w-5" /> },
] as const;

const quickLinks = [
  { href: "/customers/new", label: "Nuevo cliente", icon: <Users className="h-4 w-4" /> },
  { href: "/opportunities/new", label: "Nueva oportunidad", icon: <Briefcase className="h-4 w-4" /> },
  { href: "/quotes/new", label: "Nueva cotización", icon: <FileText className="h-4 w-4" /> },
  { href: "/orders/new", label: "Nuevo pedido", icon: <ShoppingCart className="h-4 w-4" /> },
] as const;

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const commercialAdvancedRoles = new Set(["administrador", "director_comercial", "comercial"]);

function formatKpiValue(summary: DashboardSummary | null, key: (typeof kpiConfig)[number]["key"]) {
  const value = summary?.[key] ?? 0;
  if (key === "pipelineValue") return currencyFormatter.format(Math.round(value));
  return value.toLocaleString("es-CO");
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const userRole = user?.role ?? null;
  const canViewCommercialAdvanced = userRole ? commercialAdvancedRoles.has(userRole) : false;

  const [response, commercialAdvancedResponse] = await Promise.all([
    apiFetch("/dashboard/summary"),
    canViewCommercialAdvanced
      ? apiFetch("/dashboard/commercial-advanced?days=90")
      : Promise.resolve(null),
  ]);
  const summary: DashboardSummary | null = response.ok ? await response.json() : null;
  const commercialAdvancedSummary: CommercialAdvancedSummary | null =
    commercialAdvancedResponse?.ok ? await commercialAdvancedResponse.json() : null;

  return (
    <div className="space-y-6">
      {/* Featured KPIs with ShiftCard (Cult UI) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ShiftKpiCard
          label="Valor pipeline"
          value={formatKpiValue(summary, "pipelineValue")}
          tone="success"
          detail="Valor total estimado de oportunidades en todas las etapas del pipeline comercial."
        />
        <ShiftKpiCard
          label="Ventas cerradas 30d"
          value={formatKpiValue(summary, "closedDeals")}
          tone="success"
          detail="Número de oportunidades cerradas como ganadas en los últimos 30 días."
        />
        <ShiftKpiCard
          label="Seguimientos pendientes"
          value={formatKpiValue(summary, "pendingFollowUps")}
          tone="danger"
          detail="Tareas y seguimientos que requieren acción inmediata del equipo comercial."
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { key: "openQuotes" as const, label: "Cotizaciones abiertas", tone: "info" as const, icon: <FileText className="h-5 w-5" /> },
          { key: "activeOrders" as const, label: "Pedidos activos", tone: "warning" as const, icon: <Package className="h-5 w-5" /> },
          { key: "weeklyVisits" as const, label: "Visitas esta semana", tone: "info" as const, icon: <CalendarDays className="h-5 w-5" /> },
          { key: "pendingFollowUps" as const, label: "Seguimientos pendientes", tone: "danger" as const, icon: <AlertCircle className="h-5 w-5" /> },
        ].map((card, index) => (
          <KpiCard
            key={card.key}
            label={card.label}
            value={formatKpiValue(summary, card.key)}
            tone={card.tone}
            icon={card.icon}
            index={index}
          />
        ))}
      </div>

      {/* Goals Progress Section */}
      <CustomerGoalsDashboard />

      <CommercialAdvancedDashboard summary={commercialAdvancedSummary} />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_380px]">
        {/* Activity Section */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Actividad reciente</CardTitle>
                <CardDescription>
                  Eventos relevantes generados por cotizaciones, pedidos, visitas y seguimiento.
                </CardDescription>
              </div>
              <Zap className="h-5 w-5 text-muted-foreground/40" />
            </div>
          </CardHeader>
          <CardContent>
            <ActivityList items={summary?.recentActivity ?? []} />
          </CardContent>
        </Card>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Queue */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold">Mi cola de trabajo</CardTitle>
                  <CardDescription>
                    Próximas visitas y tareas asignadas a ti.
                  </CardDescription>
                </div>
                <Link
                  href="/agenda"
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-all hover:bg-muted hover:text-foreground"
                >
                  Ver agenda
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <QueueList items={summary?.myQueue ?? []} />
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Acciones rápidas</CardTitle>
              <CardDescription>Atajos a los flujos más frecuentes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group inline-flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-transparent bg-secondary px-2.5 text-sm font-medium whitespace-nowrap text-secondary-foreground transition-all hover:bg-secondary/80"
                  >
                    <span className="flex items-center gap-2">
                      {link.icon}
                      {link.label}
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Nora Widget */}
          <Card className="relative overflow-hidden border-nora-500/20 bg-gradient-to-br from-nora-500/10 to-nora-600/5">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-nora-300">Nora</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tu asistente comercial inteligente.
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-nora-500/20">
                  <Zap className="h-4 w-4 text-nora-400" />
                </div>
              </div>
              <Link
                href="/nora"
                className="mt-4 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-transparent bg-nora-600 px-2.5 text-sm font-medium whitespace-nowrap text-white transition-all hover:bg-nora-500"
              >
                Abrir conversación
              </Link>
            </CardContent>
          </Card>

          {/* MorphSurface Feedback Widget (Cult UI) */}
          <FeedbackWidget />
        </div>
      </div>
    </div>
  );
}
