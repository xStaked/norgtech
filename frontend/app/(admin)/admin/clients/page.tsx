import Link from 'next/link'
import { Plus, Search, Sprout, Users } from 'lucide-react'
import { ClientCard } from '@/components/admin/client-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchAdvisorOptions } from '../_lib/server-advisors'
import { fetchClients } from './_lib/server-clients'

interface ClientsPageProps {
  searchParams: Promise<{
    page?: string
    advisorId?: string
    status?: string
    speciesType?: string
    search?: string
  }>
}

function buildFilterHref(searchParams: {
  page?: string
  advisorId?: string
  status?: string
  speciesType?: string
  search?: string
}, patch: Record<string, string | undefined>) {
  const next = new URLSearchParams()
  const merged = { ...searchParams, ...patch }

  Object.entries(merged).forEach(([key, value]) => {
    if (!value) return
    next.set(key, value)
  })

  const query = next.toString()
  return query ? `/admin/clients?${query}` : '/admin/clients'
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const params = await searchParams
  const selectedAdvisorId =
    params.advisorId && params.advisorId !== 'all' ? params.advisorId : undefined
  const [response, advisors] = await Promise.all([
    fetchClients({
      page: params.page ? Number(params.page) : 1,
      limit: 12,
      advisorId: selectedAdvisorId,
      status: params.status,
      speciesType: params.speciesType,
      search: params.search,
    }),
    fetchAdvisorOptions(),
  ])

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(45,106,79,0.14),_transparent_35%),linear-gradient(180deg,_rgba(255,255,255,0.92),_rgba(240,253,244,0.72))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
                <Sprout className="size-3.5" />
                CRM interno Norgtech
              </div>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Productores con contexto comercial y técnico en una sola vista.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Filtra, crea y consulta productores con sus granjas asociadas, casos abiertos y ritmo de acompañamiento técnico.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total visibles</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{response.meta.total}</p>
              </div>
              <div className="rounded-3xl border border-accent/20 bg-accent/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Página actual</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{response.meta.page}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-card/90 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <form className="grid flex-1 gap-3 xl:grid-cols-[1.2fr_0.9fr_auto]" action="/admin/clients">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="search"
                  defaultValue={params.search}
                  className="pl-9"
                  placeholder="Buscar por nombre, empresa o correo"
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

              <div className="flex gap-3">
                <Button type="submit" variant="outline" className="border-primary/20">
                  Aplicar filtros
                </Button>
              </div>
            </form>

            <Button asChild>
              <Link href="/admin/clients/new">
                <Plus className="size-4" />
                Nuevo productor
              </Link>
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildFilterHref(params, { advisorId: params.advisorId, status: undefined })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${!params.status ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'}`}
            >
              Todos
            </Link>
            <Link
              href={buildFilterHref(params, { advisorId: params.advisorId, status: 'active' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.status === 'active' ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'}`}
            >
              Activos
            </Link>
            <Link
              href={buildFilterHref(params, { advisorId: params.advisorId, status: 'inactive' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.status === 'inactive' ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'}`}
            >
              Inactivos
            </Link>
            <Link
              href={buildFilterHref(params, { advisorId: params.advisorId, speciesType: 'poultry' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.speciesType === 'poultry' ? 'border-accent/30 bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:border-accent/30 hover:text-foreground'}`}
            >
              Avícola
            </Link>
            <Link
              href={buildFilterHref(params, { advisorId: params.advisorId, speciesType: 'swine' })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${params.speciesType === 'swine' ? 'border-accent/30 bg-accent/10 text-foreground' : 'border-border text-muted-foreground hover:border-accent/30 hover:text-foreground'}`}
            >
              Porcino
            </Link>
          </div>
        </section>

        {response.items.length > 0 ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {response.items.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-border bg-card/80 p-10 text-center shadow-sm">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <div className="rounded-full bg-primary/10 p-4 text-primary">
                <Users className="size-6" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">No hay productores para estos filtros</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Ajusta la búsqueda o crea un nuevo productor para comenzar el seguimiento comercial y técnico.
              </p>
              <Button asChild>
                <Link href="/admin/clients/new">Crear productor</Link>
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
