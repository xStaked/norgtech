import Link from 'next/link'
import { ArrowRight, ClipboardList, FlaskConical, MapPinned, Waves } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CaseStatusBadge } from '@/components/admin/case-status-badge'
import { fetchPortalCases, fetchPortalDashboard, fetchPortalFarms, fetchPortalVisits } from '../_lib/server-portal'

export default async function PortalDashboardPage() {
  const [dashboard, casesResponse, farmsResponse, visitsResponse] = await Promise.all([
    fetchPortalDashboard(),
    fetchPortalCases(),
    fetchPortalFarms(),
    fetchPortalVisits(),
  ])

  const latestCases = casesResponse.items.slice(0, 3)

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2.25rem] border border-primary/10 bg-[linear-gradient(135deg,_rgba(22,101,52,0.94),_rgba(20,83,45,0.94)_55%,_rgba(249,115,22,0.9))] p-8 text-white shadow-[0_24px_80px_rgba(22,101,52,0.24)]">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <Badge className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-white hover:bg-white/10">
              Seguimiento técnico
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Hola, {dashboard.client.fullName}. Tu operación ya tiene un tablero claro de seguimiento.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
                Revisa casos abiertos, últimas visitas y recomendaciones que siguen pendientes sin depender de llamadas o correos.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-full bg-white text-primary hover:bg-white/90">
                <Link href="/portal/cases">
                  Ver casos
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10">
                <Link href="/portal/farms">Ver granjas</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Casos abiertos</p>
              <p className="mt-3 text-4xl font-semibold">{dashboard.openCases}</p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Granjas visibles</p>
              <p className="mt-3 text-4xl font-semibold">{dashboard.farms}</p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Visita más reciente</p>
              <p className="mt-3 text-lg font-semibold">
                {dashboard.lastVisit
                  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(dashboard.lastVisit.visitDate))
                  : 'Sin visitas'}
              </p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Recomendaciones</p>
              <p className="mt-3 text-4xl font-semibold">{dashboard.pendingRecommendations}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Abiertos',
            value: dashboard.casesByStatus.open,
            description: 'Casos recién abiertos y pendientes por revisar.',
            icon: ClipboardList,
          },
          {
            label: 'En análisis',
            value: dashboard.casesByStatus.in_analysis,
            description: 'Casos en diagnóstico técnico activo.',
            icon: Waves,
          },
          {
            label: 'Tratamiento',
            value: dashboard.casesByStatus.treatment,
            description: 'Acciones correctivas o monitoreo en curso.',
            icon: FlaskConical,
          },
          {
            label: 'Esperando cliente',
            value: dashboard.casesByStatus.waiting_client,
            description: 'Casos que requieren información o acción tuya.',
            icon: MapPinned,
          },
        ].map((item) => {
          const Icon = item.icon

          return (
            <Card key={item.label} className="rounded-[1.75rem] border-primary/10 bg-white/90 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                    <p className="text-3xl font-semibold text-foreground">{item.value}</p>
                  </div>
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[2rem] border-primary/10 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Casos recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestCases.length > 0 ? (
              latestCases.map((item) => (
                <Link
                  key={item.id}
                  href={`/portal/cases/${item.id}`}
                  className="block rounded-[1.5rem] border border-border/70 bg-background p-4 transition-colors hover:border-primary/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-lg font-medium text-foreground">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.farm?.name || 'Sin granja asociada'} · {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(item.updatedAt))}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CaseStatusBadge type="severity" value={item.severity} />
                      <CaseStatusBadge type="status" value={item.status} />
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                No hay casos para mostrar en este momento.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-primary/10 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Última visita y siguiente foco</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.lastVisit ? (
              <>
                <div className="rounded-[1.5rem] bg-primary/5 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-primary/70">Última visita</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'full',
                    }).format(new Date(dashboard.lastVisit.visitDate))}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {dashboard.lastVisit.farm.name} · {dashboard.lastVisit.observations || 'Sin observaciones registradas.'}
                  </p>
                </div>

                <div className="rounded-[1.5rem] bg-orange-50 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-orange-700">Recomendación activa</p>
                  <p className="mt-2 text-sm leading-6 text-orange-950">
                    {dashboard.lastVisit.recommendations || 'No quedaron recomendaciones abiertas en la última visita.'}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                Todavía no hay visitas registradas en tu portal.
              </div>
            )}

            <div className="rounded-[1.5rem] border border-border bg-background p-4">
              <p className="text-sm font-medium text-foreground">Actividad total registrada</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {visitsResponse.items.length} visitas y {farmsResponse.items.length} granjas visibles para tu operación.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
