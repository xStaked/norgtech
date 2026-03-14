import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  Plus,
  Search,
  Siren,
  Stethoscope,
} from 'lucide-react'
import { CaseStatusBadge } from '@/components/admin/case-status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  formatCaseNumber,
  getCaseSeverityLabel,
  getCaseStatsMap,
  getCaseStatusLabel,
} from '@/lib/api/cases'
import { fetchClients } from '../clients/_lib/server-clients'
import { fetchAdvisorOptions } from '../_lib/server-advisors'
import { fetchCaseStats, fetchCases } from './_lib/server-cases'
import { fetchFarms } from '../farms/_lib/server-farms'

interface CasesPageProps {
  searchParams: Promise<{
    status?: string
    severity?: string
    assignedTechId?: string
    clientId?: string
    farmId?: string
    search?: string
  }>
}

function buildFilterHref(
  searchParams: {
    status?: string
    severity?: string
    assignedTechId?: string
    clientId?: string
    farmId?: string
    search?: string
  },
  patch: Record<string, string | undefined>,
) {
  const next = new URLSearchParams()
  const merged = { ...searchParams, ...patch }

  Object.entries(merged).forEach(([key, value]) => {
    if (!value) return
    next.set(key, value)
  })

  const query = next.toString()
  return query ? `/admin/cases?${query}` : '/admin/cases'
}

export default async function CasesPage({ searchParams }: CasesPageProps) {
  const params = await searchParams
  const selectedStatus = params.status && params.status !== 'all' ? params.status : undefined
  const selectedSeverity =
    params.severity && params.severity !== 'all' ? params.severity : undefined
  const selectedAssignedTechId =
    params.assignedTechId && params.assignedTechId !== 'all'
      ? params.assignedTechId
      : undefined
  const selectedClientId =
    params.clientId && params.clientId !== 'all' ? params.clientId : undefined
  const selectedFarmId = params.farmId && params.farmId !== 'all' ? params.farmId : undefined
  const [response, stats, advisors, clients, farms] = await Promise.all([
    fetchCases({
      status: selectedStatus,
      severity: selectedSeverity,
      assignedTechId: selectedAssignedTechId,
      clientId: selectedClientId,
      farmId: selectedFarmId,
    }),
    fetchCaseStats(),
    fetchAdvisorOptions(),
    fetchClients({ limit: 100, status: 'active' }),
    fetchFarms(),
  ])

  const statsMap = getCaseStatsMap(stats)
  const searchTerm = params.search?.trim().toLowerCase() ?? ''
  const visibleCases = !searchTerm
    ? response.items
    : response.items.filter((item) => {
        const haystack = `${formatCaseNumber(item.caseNumber)} ${item.title} ${item.client.fullName} ${item.farm?.name || ''}`.toLowerCase()
        return haystack.includes(searchTerm)
      })

  const advisorMap = new Map(
    advisors.map((advisor) => [advisor.id, advisor.fullName || advisor.email || advisor.id]),
  )

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.08),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(240,253,244,0.8))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.25fr_0.95fr] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-orange-700">
                <Siren className="size-3.5" />
                Soporte técnico
              </div>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Ticketing técnico con prioridad, contexto productivo y seguimiento operativo.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Consulta casos por productor, granja, severidad o responsable técnico y entra a cada expediente para mover el seguimiento.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-red-700">Críticos</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">
                  {visibleCases.filter((item) => item.severity === 'critical').length}
                </p>
              </div>
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-700">En análisis</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">
                  {statsMap.in_analysis ?? 0}
                </p>
              </div>
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Cerrados</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">
                  {statsMap.closed ?? 0}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-card/90 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <form
              className="grid flex-1 gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_auto]"
              action="/admin/cases"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={params.search}
                  className="pl-9"
                  placeholder="Buscar por caso, productor o granja"
                />
              </div>

              <select
                name="status"
                defaultValue={params.status ?? 'all'}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
              >
                <option value="all">Todos los estados</option>
                <option value="open">{getCaseStatusLabel('open')}</option>
                <option value="in_analysis">{getCaseStatusLabel('in_analysis')}</option>
                <option value="treatment">{getCaseStatusLabel('treatment')}</option>
                <option value="waiting_client">{getCaseStatusLabel('waiting_client')}</option>
                <option value="closed">{getCaseStatusLabel('closed')}</option>
              </select>

              <select
                name="severity"
                defaultValue={params.severity ?? 'all'}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
              >
                <option value="all">Todas las severidades</option>
                <option value="low">{getCaseSeverityLabel('low')}</option>
                <option value="medium">{getCaseSeverityLabel('medium')}</option>
                <option value="high">{getCaseSeverityLabel('high')}</option>
                <option value="critical">{getCaseSeverityLabel('critical')}</option>
              </select>

              <select
                name="assignedTechId"
                defaultValue={params.assignedTechId ?? 'all'}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
              >
                <option value="all">Todos los técnicos</option>
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>
                    {advisor.fullName || advisor.email || advisor.id}
                  </option>
                ))}
              </select>

              <select
                name="clientId"
                defaultValue={params.clientId ?? 'all'}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
              >
                <option value="all">Todos los productores</option>
                {clients.items.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.fullName}
                  </option>
                ))}
              </select>

              <div className="flex gap-3">
                <Button type="submit" variant="outline" className="border-primary/20">
                  Aplicar filtros
                </Button>
                <Button asChild>
                  <Link href="/admin/cases/new">
                    <Plus className="size-4" />
                    Nuevo caso
                  </Link>
                </Button>
              </div>
            </form>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildFilterHref(params, { status: undefined })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${!params.status ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'}`}
            >
              Todos
            </Link>
            <Link
              href={buildFilterHref(params, { status: 'open' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.status === 'open' ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-border text-muted-foreground hover:border-sky-200 hover:text-foreground'}`}
            >
              Abiertos
            </Link>
            <Link
              href={buildFilterHref(params, { status: 'in_analysis' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.status === 'in_analysis' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-border text-muted-foreground hover:border-amber-200 hover:text-foreground'}`}
            >
              En análisis
            </Link>
            <Link
              href={buildFilterHref(params, { severity: 'critical' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-700' : 'border-border text-muted-foreground hover:border-red-200 hover:text-foreground'}`}
            >
              Críticos
            </Link>
            <Link
              href={buildFilterHref(params, { severity: 'high' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.severity === 'high' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-border text-muted-foreground hover:border-orange-200 hover:text-foreground'}`}
            >
              Altos
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { key: 'open', label: 'Abiertos', value: statsMap.open ?? 0 },
            { key: 'in_analysis', label: 'En análisis', value: statsMap.in_analysis ?? 0 },
            { key: 'treatment', label: 'Tratamiento', value: statsMap.treatment ?? 0 },
            { key: 'waiting_client', label: 'Esperando cliente', value: statsMap.waiting_client ?? 0 },
          ].map((item) => (
            <Card key={item.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {item.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-foreground">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {visibleCases.length > 0 ? (
          <section className="grid gap-5 xl:grid-cols-2">
            {visibleCases.map((item) => (
              <Card
                key={item.id}
                className="border-border/70 bg-card/95 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardHeader className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        <Stethoscope className="size-3.5" />
                        {formatCaseNumber(item.caseNumber)}
                      </div>
                      <div>
                        <CardTitle className="text-xl text-foreground">{item.title}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.client.fullName}
                          {item.farm?.name ? ` · ${item.farm.name}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <CaseStatusBadge type="severity" value={item.severity} />
                      <CaseStatusBadge type="status" value={item.status} />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {item.description || 'Sin descripción extendida registrada por ahora.'}
                  </p>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Técnico
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {item.assignedTechId
                          ? advisorMap.get(item.assignedTechId) || item.assignedTechId.slice(0, 8)
                          : 'Sin asignar'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Timeline
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {item._count?.messages ?? 0} eventos
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Apertura
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {new Intl.DateTimeFormat('es-CO', {
                          dateStyle: 'medium',
                        }).format(new Date(item.createdAt))}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {item.farmId
                        ? farms.items.find((farm) => farm.id === item.farmId)?.location || 'Ubicación pendiente'
                        : 'Sin granja asociada'}
                    </p>
                    <Button asChild variant="outline" className="border-primary/20 bg-background/60">
                      <Link href={`/admin/cases/${item.id}`}>
                        Abrir expediente
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-border bg-card/80 p-10 text-center shadow-sm">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <div className="rounded-full bg-orange-50 p-4 text-orange-700">
                <AlertTriangle className="size-6" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">No hay casos para estos filtros</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Ajusta la búsqueda o registra un nuevo caso para empezar el seguimiento del equipo técnico.
              </p>
              <Button asChild>
                <Link href="/admin/cases/new">Crear caso</Link>
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
