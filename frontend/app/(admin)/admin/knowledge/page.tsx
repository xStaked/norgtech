import Link from 'next/link'
import { BookOpen, NotebookTabs, SearchCode, ShieldCheck } from 'lucide-react'
import { ArticleCard } from '@/components/admin/article-card'
import { KnowledgeFilters } from '@/components/admin/knowledge-filters'
import { Button } from '@/components/ui/button'
import { fetchKnowledgeArticles } from './_lib/server-knowledge'

interface KnowledgePageProps {
  searchParams: Promise<{
    category?: string
    speciesType?: string
    search?: string
    tags?: string
    isPublished?: string
  }>
}

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const params = await searchParams
  const response = await fetchKnowledgeArticles({
    category: params.category || undefined,
    speciesType:
      params.speciesType && params.speciesType !== 'all' ? params.speciesType : undefined,
    search: params.search || undefined,
    tags: params.tags
      ?.split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    isPublished:
      params.isPublished === 'true'
        ? true
        : params.isPublished === 'false'
          ? false
          : undefined,
  })

  const publishedCount = response.items.filter((item) => item.isPublished).length
  const poultryCount = response.items.filter((item) => item.speciesType === 'poultry').length
  const swineCount = response.items.filter((item) => item.speciesType === 'swine').length

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(26,58,42,0.1),_transparent_30%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(240,253,244,0.78))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.2fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
                <BookOpen className="size-3.5" />
                Biblioteca técnica Norgtech
              </div>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Guías, protocolos y criterios técnicos listos para consulta operativa.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Centraliza conocimiento interno por especie, categoría y tags para acelerar diagnóstico, entrenamiento y soporte consultivo.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-primary">Visibles</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{response.items.length}</p>
              </div>
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Publicados</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{publishedCount}</p>
              </div>
              <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-orange-700">Borradores</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">
                  {response.items.length - publishedCount}
                </p>
              </div>
            </div>
          </div>
        </section>

        <KnowledgeFilters params={params} />

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[2rem] border border-border bg-card/90 p-5 shadow-sm">
            <div className="inline-flex rounded-2xl bg-sky-50 p-3 text-sky-700">
              <NotebookTabs className="size-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">Cobertura por especie</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {poultryCount} artículos avícolas, {swineCount} porcinos y{' '}
              {response.items.filter((item) => item.speciesType === 'both').length} transversales.
            </p>
          </div>

          <div className="rounded-[2rem] border border-border bg-card/90 p-5 shadow-sm">
            <div className="inline-flex rounded-2xl bg-amber-50 p-3 text-amber-700">
              <SearchCode className="size-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">Búsqueda contextual</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Usa títulos, categorías y tags para encontrar protocolos con rapidez durante soporte y visitas.
            </p>
          </div>

          <div className="rounded-[2rem] border border-border bg-card/90 p-5 shadow-sm">
            <div className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <ShieldCheck className="size-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">Curación interna</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Mantén borradores, valida contenido y publica solo artículos listos para consumo del equipo.
            </p>
          </div>
        </section>

        {response.items.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-border bg-card/80 p-12 text-center shadow-sm">
            <div className="mx-auto max-w-md space-y-4">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="size-6" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">No hay artículos para este filtro</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Ajusta la búsqueda o crea un nuevo artículo para empezar a consolidar la base técnica.
              </p>
              <Button asChild>
                <Link href="/admin/knowledge/new">Crear artículo</Link>
              </Button>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 xl:grid-cols-2">
            {response.items.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
