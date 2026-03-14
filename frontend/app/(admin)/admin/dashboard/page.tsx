import {
  Activity,
  Clock3,
  Sprout,
  Stethoscope,
  TrendingUp,
} from 'lucide-react'
import { AdvisorTable } from '@/components/admin/advisor-table'
import { CasesDonutChart } from '@/components/admin/cases-donut-chart'
import { RecentActivityFeed } from '@/components/admin/recent-activity-feed'
import { StatsCard } from '@/components/admin/stats-card'
import type { DashboardActivityItem } from '@/lib/api/dashboard'
import { getCaseStatusLabel } from '@/lib/api/cases'
import { getVisitSpeciesLabel } from '@/lib/api/visits'
import { requireAdminUser } from '@/lib/auth/server'
import { fetchCases } from '../cases/_lib/server-cases'
import { fetchVisits } from '../visits/_lib/server-visits'
import {
  fetchAdminDashboardStats,
  fetchAdvisorDashboardStats,
} from './_lib/server-dashboard'

function formatRoleLabel(role: string | null | undefined) {
  if (role === 'admin') return 'Administración general'
  if (role === 'asesor_tecnico') return 'Asesor técnico'
  if (role === 'asesor_comercial') return 'Asesor comercial'
  return 'Equipo Norgtech'
}

function formatHours(value: number) {
  if (value === 0) return 'Sin datos'
  return `${value.toFixed(1)} h`
}

function buildRecentActivity(params: {
  cases: Awaited<ReturnType<typeof fetchCases>>['items']
  visits: Awaited<ReturnType<typeof fetchVisits>>['items']
}): DashboardActivityItem[] {
  const caseItems: DashboardActivityItem[] = params.cases.slice(0, 4).map((item) => ({
    id: item.id,
    type: 'case',
    title: `${item.title} · ${item.client.fullName}`,
    description: `Estado ${getCaseStatusLabel(item.status)}${item.farm?.name ? ` en ${item.farm.name}` : ''}.`,
    href: `/admin/cases/${item.id}`,
    createdAt: item.updatedAt,
    meta: `Caso ${String(item.caseNumber).padStart(4, '0')}`,
    tone: 'warning',
  }))

  const visitItems: DashboardActivityItem[] = params.visits.slice(0, 4).map((item) => ({
    id: item.id,
    type: 'visit',
    title: `${item.client.fullName} · ${item.farm.name}`,
    description: `${getVisitSpeciesLabel(item.farm.speciesType)}${item.case ? ` vinculada al caso ${String(item.case.caseNumber).padStart(4, '0')}` : ' con seguimiento de campo.'}`,
    href: `/admin/visits/${item.id}`,
    createdAt: item.visitDate,
    meta: 'Visita técnica',
    tone: 'success',
  }))

  return [...caseItems, ...visitItems]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 6)
}

export default async function AdminDashboardPage() {
  const { user, profile } = await requireAdminUser()
  const isOrganizationDashboard = profile?.role === 'admin'
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const [stats, casesResponse, visitsResponse] = await Promise.all([
    isOrganizationDashboard ? fetchAdminDashboardStats() : fetchAdvisorDashboardStats(),
    fetchCases({
      limit: 6,
      ...(isOrganizationDashboard ? {} : { assignedTechId: user.id }),
    }),
    fetchVisits({
      ...(isOrganizationDashboard ? {} : { advisorId: user.id }),
      dateFrom: ninetyDaysAgo.toISOString(),
    }),
  ])

  const recentActivity = buildRecentActivity({
    cases: casesResponse.items,
    visits: visitsResponse.items,
  })

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(26,58,42,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.16),_transparent_24%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(240,253,244,0.82))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(26,58,42,0.92)_46%,rgba(249,115,22,0.82))] text-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.65)]">
          <div className="grid gap-8 p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-white/80">
                <TrendingUp className="size-3.5" />
                Fase 6 · Dashboards
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
                  {isOrganizationDashboard
                    ? 'Pulso operativo de Norgtech en una sola pantalla.'
                    : 'Tu tablero diario de soporte técnico y actividad en campo.'}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
                  {profile?.full_name || user.email} · {formatRoleLabel(profile?.role)}. Revisa cartera activa, carga de casos, velocidad de respuesta y movimiento de visitas sin salir del panel.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-white/70">Casos activos</p>
                <p className="mt-2 text-4xl font-semibold">{stats.openCases}</p>
                <p className="mt-1 text-sm text-white/70">Backlog vivo para seguimiento inmediato.</p>
              </div>
              <div className="rounded-[1.75rem] border border-white/15 bg-black/10 p-5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-white/70">Visitas del mes</p>
                <p className="mt-2 text-4xl font-semibold">{stats.visitsThisMonth}</p>
                <p className="mt-1 text-sm text-white/70">Actividad de campo ejecutada en el periodo actual.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard
            eyebrow="Portafolio"
            value={stats.activeClients.toString()}
            label="Productores activos"
            description="Clientes con operación vigente y seguimiento dentro de tu organización."
            icon={<Sprout className="size-5" />}
            accentClassName="border border-emerald-200 bg-emerald-50/80"
          />
          <StatsCard
            eyebrow="Soporte"
            value={stats.openCases.toString()}
            label="Casos sin cierre"
            description="Suma de casos abiertos, en análisis, en tratamiento y esperando respuesta."
            icon={<Stethoscope className="size-5" />}
            accentClassName="border border-orange-200 bg-orange-50/90"
          />
          <StatsCard
            eyebrow="Campo"
            value={stats.visitsThisMonth.toString()}
            label="Visitas este mes"
            description="Intervenciones técnicas registradas dentro del mes corriente."
            icon={<Activity className="size-5" />}
            accentClassName="border border-sky-200 bg-sky-50/90"
          />
          <StatsCard
            eyebrow="Velocidad"
            value={formatHours(stats.avgResponseTimeHours)}
            label="Tiempo promedio de respuesta"
            description="Promedio entre apertura del caso y el primer mensaje registrado."
            icon={<Clock3 className="size-5" />}
            accentClassName="border border-amber-200 bg-amber-50/90"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <CasesDonutChart stats={stats} />
          <RecentActivityFeed items={recentActivity} />
        </section>

        <AdvisorTable
          items={stats.advisorActivity}
          mode={isOrganizationDashboard ? 'organization' : 'advisor'}
        />
      </div>
    </div>
  )
}
