import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button-link";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { ActivityList } from "@/components/dashboard/activity-list";
import { QueueList } from "@/components/dashboard/queue-list";
import { FeedbackWidget } from "@/components/dashboard/feedback-widget";
import { CustomerGoalsDashboard } from "@/components/dashboard/customer-goals-dashboard";
import {
  CommercialAdvancedDashboard,
  type CommercialAdvancedSummary,
} from "@/components/dashboard/commercial-advanced-dashboard";
import {
  SellerGoalsDashboard,
  type SellerGoalsSummary,
} from "@/components/dashboard/seller-goals-dashboard";
import { CreditAlertsWidget } from "@/components/dashboard/credit-alerts-widget";
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
const sellerGoalsRoles = new Set(["administrador", "director_comercial"]);

function formatKpiValue(summary: DashboardSummary | null, key: (typeof kpiConfig)[number]["key"]) {
  const value = summary?.[key] ?? 0;
  if (key === "pipelineValue") return currencyFormatter.format(Math.round(value));
  return value.toLocaleString("es-CO");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    goalPeriodType?: string;
    goalPeriodValue?: string;
  }>;
}) {
  const { companyId, goalPeriodType, goalPeriodValue } = await searchParams;
  const user = await getCurrentUser();
  const userRole = user?.role ?? null;
  const canViewCommercialAdvanced = userRole ? commercialAdvancedRoles.has(userRole) : false;
  const canViewSellerGoals = userRole ? sellerGoalsRoles.has(userRole) : false;

  const summaryQuery = companyId ? `/dashboard/summary?companyId=${companyId}` : "/dashboard/summary";
  const commercialQuery = companyId
    ? `/dashboard/commercial-advanced?days=90&companyId=${companyId}`
    : "/dashboard/commercial-advanced?days=90";
  // periodType y periodValue viajan juntos o no viajan: la API rechaza uno
  // suelto (400), y el panel caeria entero por un enlace a medias.
  const sellerGoalsParams = new URLSearchParams();
  if (companyId) sellerGoalsParams.set("companyId", companyId);
  if (goalPeriodType && goalPeriodValue) {
    sellerGoalsParams.set("periodType", goalPeriodType);
    sellerGoalsParams.set("periodValue", goalPeriodValue);
  }
  const sellerGoalsQuery = sellerGoalsParams.size
    ? `/dashboard/seller-goals?${sellerGoalsParams}`
    : "/dashboard/seller-goals";

  const [response, commercialAdvancedResponse, sellerGoalsResponse, companiesRes] = await Promise.all([
    apiFetch(summaryQuery),
    canViewCommercialAdvanced
      ? apiFetch(commercialQuery)
      : Promise.resolve(null),
    canViewSellerGoals
      ? apiFetch(sellerGoalsQuery)
      : Promise.resolve(null),
    apiFetch("/companies"),
  ]);

  const companies: Array<{ id: string; name: string; prefix: string }> =
    companiesRes.ok ? await companiesRes.json() : [];

  const summary: DashboardSummary | null = response.ok ? await response.json() : null;
  const commercialAdvancedSummary: CommercialAdvancedSummary | null =
    commercialAdvancedResponse?.ok ? await commercialAdvancedResponse.json() : null;
  const sellerGoalsSummary: SellerGoalsSummary | null =
    sellerGoalsResponse?.ok ? await sellerGoalsResponse.json() : null;

  const emailLocal = user?.email?.split("@")[0]?.split(/[._-]/)[0] ?? "";
  const greetingName = emailLocal
    ? emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1)
    : "Daniel";
  const today = new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6">
      {/* Greeting header */}
      <PageHeader
        title={`Buenos días, ${greetingName}`}
        description={`Resumen comercial · ${today}`}
        actions={
          <>
            <ButtonLink href="/orders" variant="secondary">
              Exportar
            </ButtonLink>
            <ButtonLink href="/orders/new">Nuevo pedido</ButtonLink>
          </>
        }
      />

      {/* Company Filter */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/dashboard"
          className={[
            "rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
            !companyId
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-muted",
          ].join(" ")}
        >
          Todas las empresas
        </Link>
        {companies.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard?companyId=${c.id}`}
            className={[
              "rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
              companyId === c.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            {c.name} ({c.prefix})
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Valor pipeline"
          value={formatKpiValue(summary, "pipelineValue")}
          tone="success"
          meta="Total estimado de oportunidades en pipeline"
        />
        <StatCard
          label="Ventas cerradas 30d"
          value={formatKpiValue(summary, "closedDeals")}
          tone="success"
          meta="Oportunidades ganadas en los últimos 30 días"
        />
        <StatCard
          label="Cotizaciones abiertas"
          value={formatKpiValue(summary, "openQuotes")}
          tone="info"
          meta="Propuestas comerciales vigentes"
        />
        <StatCard
          label="Seguimientos pendientes"
          value={formatKpiValue(summary, "pendingFollowUps")}
          tone="danger"
          meta="Tareas que requieren acción inmediata"
        />
      </div>

      {/* Goals Progress Section */}
      <CustomerGoalsDashboard />

      <SellerGoalsDashboard summary={sellerGoalsSummary} companyId={companyId} />

      <CommercialAdvancedDashboard summary={commercialAdvancedSummary} />

      <CreditAlertsWidget companyId={companyId} />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_380px]">
        {/* Activity Section */}
        <SectionCard
          title="Actividad reciente"
          description="Eventos relevantes generados por cotizaciones, pedidos, visitas y seguimiento."
          actions={<Zap className="h-5 w-5 text-muted-foreground/40" />}
        >
          <ActivityList items={summary?.recentActivity ?? []} />
        </SectionCard>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Queue */}
          <SectionCard
            title="Mi cola de trabajo"
            description="Próximas visitas y tareas asignadas a ti."
            actions={
              <Link
                href="/agenda"
                className="inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Ver agenda
              </Link>
            }
          >
            <QueueList items={summary?.myQueue ?? []} />
          </SectionCard>

          {/* Quick Actions */}
          <SectionCard
            title="Acciones rápidas"
            description="Atajos a los flujos más frecuentes."
          >
            <div className="space-y-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-muted px-2.5 text-sm font-semibold whitespace-nowrap text-foreground transition-colors hover:bg-[#e6f0f6] hover:text-[#0f5c8a]"
                >
                  <span className="flex items-center gap-2">
                    {link.icon}
                    {link.label}
                  </span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </SectionCard>

          {/* Nora Widget */}
          <Card className="relative overflow-hidden rounded-[11px] border-border bg-[#f8f6ff]">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#4f46e5]">Magali</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tu asistente comercial inteligente.
                  </p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ece9ff]">
                  <Zap className="h-4 w-4 text-[#6366f1]" />
                </div>
              </div>
              <Link
                href="/nora"
                className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#6366f1] px-2.5 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#4f46e5]"
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
