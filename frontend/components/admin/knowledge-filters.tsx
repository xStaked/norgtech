import Link from 'next/link'
import { Filter, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface KnowledgeFiltersProps {
  basePath?: string
  params: {
    category?: string
    speciesType?: string
    search?: string
    tags?: string
    isPublished?: string
  }
}

function buildHref(
  params: KnowledgeFiltersProps['params'],
  patch: Record<string, string | undefined>,
  basePath: string,
) {
  const next = new URLSearchParams()
  const merged = { ...params, ...patch }

  Object.entries(merged).forEach(([key, value]) => {
    if (!value) return
    next.set(key, value)
  })

  const query = next.toString()
  return query ? `${basePath}?${query}` : basePath
}

export function KnowledgeFilters({
  basePath = '/admin/knowledge',
  params,
}: KnowledgeFiltersProps) {
  return (
    <section className="rounded-[2rem] border border-border bg-card/90 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <form className="grid flex-1 gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr_0.8fr_auto]" action={basePath}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="search"
              defaultValue={params.search}
              className="pl-9"
              placeholder="Buscar por título, contenido o criterio"
            />
          </div>

          <Input
            name="category"
            defaultValue={params.category}
            placeholder="Categoría"
          />

          <select
            name="speciesType"
            defaultValue={params.speciesType ?? 'all'}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
          >
            <option value="all">Todas las especies</option>
            <option value="both">Ambas</option>
            <option value="poultry">Avícola</option>
            <option value="swine">Porcino</option>
          </select>

          <Input
            name="tags"
            defaultValue={params.tags}
            placeholder="Tags: bioseguridad, ventilación"
          />

          <select
            name="isPublished"
            defaultValue={params.isPublished ?? 'all'}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
          >
            <option value="all">Todos</option>
            <option value="true">Publicados</option>
            <option value="false">Borradores</option>
          </select>

          <div className="flex gap-3">
            <Button type="submit" variant="outline" className="border-primary/20">
              <Filter className="size-4" />
              Aplicar
            </Button>
          </div>
        </form>

        <Button asChild>
          <Link href="/admin/knowledge/new">
            <Plus className="size-4" />
            Nuevo artículo
          </Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { label: 'Todo', patch: { category: undefined, speciesType: undefined, isPublished: undefined } },
          { label: 'Publicados', patch: { isPublished: 'true' } },
          { label: 'Borradores', patch: { isPublished: 'false' } },
          { label: 'Avícola', patch: { speciesType: 'poultry' } },
          { label: 'Porcino', patch: { speciesType: 'swine' } },
        ].map((shortcut) => {
          const active =
            (shortcut.label === 'Todo' && !params.speciesType && !params.isPublished && !params.category) ||
            (shortcut.patch.speciesType && params.speciesType === shortcut.patch.speciesType) ||
            (shortcut.patch.isPublished && params.isPublished === shortcut.patch.isPublished)

          return (
            <Link
              key={shortcut.label}
              href={buildHref(params, shortcut.patch, basePath)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-primary/20 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/20 hover:text-foreground',
              )}
            >
              {shortcut.label}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
