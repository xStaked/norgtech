import Link from 'next/link'
import { Plus, Search, SlidersHorizontal, Sprout } from 'lucide-react'
import { FarmCard } from '@/components/admin/farm-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchClients } from '../clients/_lib/server-clients'
import { fetchAdvisorOptions } from '../_lib/server-advisors'
import { fetchFarms } from './_lib/server-farms'

interface FarmsPageProps {
  searchParams: Promise<{
    clientId?: string
    advisorId?: string
    speciesType?: string
    search?: string
  }>
}

function buildFilterHref(
  searchParams: {
    clientId?: string
    advisorId?: string
    speciesType?: string
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
  return query ? `/admin/farms?${query}` : '/admin/farms'
}

export default async function FarmsPage({ searchParams }: FarmsPageProps) {
  const params = await searchParams
  const selectedClientId = params.clientId && params.clientId !== 'all' ? params.clientId : undefined
  const selectedAdvisorId =
    params.advisorId && params.advisorId !== 'all' ? params.advisorId : undefined
  const selectedSpeciesType =
    params.speciesType && params.speciesType !== 'all' ? params.speciesType : undefined
  const [response, clients, advisors] = await Promise.all([
    fetchFarms({
      clientId: selectedClientId,
      advisorId: selectedAdvisorId,
      speciesType: selectedSpeciesType,
    }),
    fetchClients({ limit: 100, status: 'active' }),
    fetchAdvisorOptions(),
  ])

  const searchTerm = params.search?.trim().toLowerCase() ?? ''
  const visibleFarms = !searchTerm
    ? response.items
    : response.items.filter((farm) => {
        const haystack =
          `${farm.name} ${farm.client.fullName} ${farm.client.companyName || ''} ${farm.location || ''}`.toLowerCase()
        return haystack.includes(searchTerm)
      })

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(45,106,79,0.14),_transparent_35%),linear-gradient(180deg,_rgba(255,255,255,0.92),_rgba(240,253,244,0.72))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
                <Sprout className="size-3.5" />
                Operación por granja
              </div>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Granjas avícolas y porcinas con contexto operativo inmediato.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Filtra por productor, especie o asesor y abre la ficha de cada unidad para revisar visitas, capacidad y actividad técnica.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total visibles</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{visibleFarms.length}</p>
              </div>
              <div className="rounded-3xl border border-accent/20 bg-accent/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Asesores activos</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{advisors.length}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-card/90 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <form className="grid flex-1 gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]" action="/admin/farms">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={params.search}
                  className="pl-9"
                  placeholder="Buscar por granja, productor o ubicación"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <SlidersHorizontal className="size-3.5" />
                  Productor
                </div>
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
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Especie</div>
                <select
                  name="speciesType"
                  defaultValue={params.speciesType ?? 'all'}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
                >
                  <option value="all">Todas las especies</option>
                  <option value="poultry">Avícola</option>
                  <option value="swine">Porcino</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Asesor</div>
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
              </div>

              <div className="flex gap-3 self-end">
                <Button type="submit" variant="outline" className="border-primary/20">
                  Aplicar filtros
                </Button>
                <Button asChild>
                  <Link href="/admin/farms/new">
                    <Plus className="size-4" />
                    Nueva granja
                  </Link>
                </Button>
              </div>
            </form>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildFilterHref(params, { speciesType: undefined })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${!params.speciesType ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'}`}
            >
              Todas
            </Link>
            <Link
              href={buildFilterHref(params, { speciesType: 'poultry' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.speciesType === 'poultry' ? 'border-accent/30 bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:border-accent/30 hover:text-foreground'}`}
            >
              Avícola
            </Link>
            <Link
              href={buildFilterHref(params, { speciesType: 'swine' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.speciesType === 'swine' ? 'border-accent/30 bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:border-accent/30 hover:text-foreground'}`}
            >
              Porcino
            </Link>
          </div>
        </section>

        {visibleFarms.length > 0 ? (
          <section className="grid gap-5 xl:grid-cols-2">
            {visibleFarms.map((farm) => (
              <FarmCard key={farm.id} farm={farm} />
            ))}
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-border bg-card/80 p-10 text-center shadow-sm">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <div className="rounded-full bg-primary/10 p-4 text-primary">
                <Sprout className="size-6" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">No hay granjas para estos filtros</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Ajusta la búsqueda o crea una nueva granja para empezar a consolidar la operación del productor.
              </p>
              <Button asChild>
                <Link href="/admin/farms/new">Crear granja</Link>
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
