import Link from 'next/link'
import { CalendarRange, MapPin, Plus, Search, Stethoscope } from 'lucide-react'
import { VisitSummaryCard } from '@/components/admin/visit-summary-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchClients } from '../clients/_lib/server-clients'
import { fetchFarms } from '../farms/_lib/server-farms'
import { fetchAdvisorOptions } from '../_lib/server-advisors'
import { fetchVisits } from './_lib/server-visits'

interface VisitsPageProps {
  searchParams: Promise<{
    advisorId?: string
    clientId?: string
    farmId?: string
    dateFrom?: string
    dateTo?: string
    search?: string
  }>
}

export default async function VisitsPage({ searchParams }: VisitsPageProps) {
  const params = await searchParams
  const [response, advisors, clients, farms] = await Promise.all([
    fetchVisits({
      advisorId: params.advisorId && params.advisorId !== 'all' ? params.advisorId : undefined,
      clientId: params.clientId && params.clientId !== 'all' ? params.clientId : undefined,
      farmId: params.farmId && params.farmId !== 'all' ? params.farmId : undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
    }),
    fetchAdvisorOptions(),
    fetchClients({ limit: 100, status: 'active' }),
    fetchFarms(),
  ])

  const searchTerm = params.search?.trim().toLowerCase() ?? ''
  const visibleVisits = !searchTerm
    ? response.items
    : response.items.filter((visit) =>
        `${visit.client.fullName} ${visit.farm.name} ${visit.observations || ''} ${visit.recommendations || ''}`
          .toLowerCase()
          .includes(searchTerm),
      )

  const poultryVisits = visibleVisits.filter((visit) => visit.farm.speciesType === 'poultry').length
  const swineVisits = visibleVisits.filter((visit) => visit.farm.speciesType === 'swine').length
  const visitsWithCase = visibleVisits.filter((visit) => Boolean(visit.case)).length

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_right,_rgba(26,58,42,0.08),_transparent_28%),linear-gradient(180deg,_rgba(240,253,244,0.65),_rgba(255,255,255,0.95))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.2fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-700">
                <MapPin className="size-3.5" />
                Campo y seguimiento
              </div>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Registro de visitas con foco operativo, especie y continuidad técnica.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Consolida las visitas de asesores, cruza cada salida con productor, granja y caso, y deja trazabilidad lista para análisis y seguimiento.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-primary">Totales</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{visibleVisits.length}</p>
              </div>
              <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-orange-700">Avícola</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{poultryVisits}</p>
              </div>
              <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-700">Porcino</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{swineVisits}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-card/90 p-5 shadow-sm">
          <form className="grid gap-3 xl:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_auto]" action="/admin/visits">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="search"
                defaultValue={params.search}
                className="pl-9"
                placeholder="Buscar por productor, granja u observación"
              />
            </div>

            <select
              name="advisorId"
              defaultValue={params.advisorId ?? 'all'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
            >
              <option value="all">Todos los asesores</option>
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

            <select
              name="farmId"
              defaultValue={params.farmId ?? 'all'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
            >
              <option value="all">Todas las granjas</option>
              {farms.items.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>

            <Input name="dateFrom" type="date" defaultValue={params.dateFrom} />
            <Input name="dateTo" type="date" defaultValue={params.dateTo} />

            <div className="flex gap-3">
              <Button type="submit" variant="outline" className="border-primary/20">
                Aplicar
              </Button>
              <Button asChild>
                <Link href="/admin/visits/new">
                  <Plus className="size-4" />
                  Nueva
                </Link>
              </Button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1.5 text-sm text-muted-foreground">
              <Stethoscope className="size-4" />
              {visitsWithCase} visitas con caso asociado
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1.5 text-sm text-muted-foreground">
              <CalendarRange className="size-4" />
              {params.dateFrom || params.dateTo
                ? `Rango ${params.dateFrom || 'inicio'} a ${params.dateTo || 'hoy'}`
                : 'Sin rango de fechas aplicado'}
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          {visibleVisits.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-border bg-card/80 p-12 text-center">
              <h2 className="text-xl font-semibold text-foreground">No hay visitas para este filtro</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ajusta los filtros o registra una nueva visita para empezar el historial de campo.
              </p>
            </div>
          ) : (
            visibleVisits.map((visit) => <VisitSummaryCard key={visit.id} visit={visit} />)
          )}
        </section>
      </div>
    </div>
  )
}
