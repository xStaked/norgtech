import Link from 'next/link'
import { ArrowLeft, BookText, PencilLine, Tags } from 'lucide-react'
import { ArticleMarkdownPreview } from '@/components/admin/article-markdown-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getKnowledgeSpeciesLabel,
  getKnowledgeStatusLabel,
} from '@/lib/api/knowledge'
import { fetchKnowledgeArticle } from '../_lib/server-knowledge'

interface KnowledgeDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function KnowledgeDetailPage({
  params,
}: KnowledgeDetailPageProps) {
  const { id } = await params
  const article = await fetchKnowledgeArticle(id)

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(26,58,42,0.08),_transparent_30%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(240,253,244,0.75))] p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/knowledge"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Volver a la biblioteca
          </Link>

          <Button asChild variant="outline" className="border-primary/20">
            <Link href={`/admin/knowledge/${article.id}/edit`}>
              <PencilLine className="size-4" />
              Editar artículo
            </Link>
          </Button>
        </div>

        <section className="rounded-[2rem] border border-primary/10 bg-card/95 p-8 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                  {article.category}
                </Badge>
                <Badge
                  variant="outline"
                  className={article.isPublished ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}
                >
                  {getKnowledgeStatusLabel(article.isPublished)}
                </Badge>
                <Badge variant="outline" className="border-border bg-muted/20">
                  {getKnowledgeSpeciesLabel(article.speciesType)}
                </Badge>
              </div>

              <div className="space-y-2">
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {article.title}
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  Actualizado{' '}
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  }).format(new Date(article.updatedAt))}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Autor</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {article.author?.fullName || article.author?.email || 'Sin perfil'}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Creación</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
                    new Date(article.createdAt),
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <BookText className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Contenido técnico</h2>
                <p className="text-sm text-muted-foreground">
                  Vista formateada del artículo en markdown.
                </p>
              </div>
            </div>

            <ArticleMarkdownPreview content={article.content} />
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-border bg-card/95 p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-orange-50 p-3 text-orange-700">
                  <Tags className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Etiquetas</h2>
                  <p className="text-sm text-muted-foreground">
                    Taxonomía rápida para búsqueda y agrupación.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {article.tags.length > 0 ? (
                  article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-sm text-primary"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Este artículo aún no tiene tags definidos.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
