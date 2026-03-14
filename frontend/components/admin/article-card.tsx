import Link from 'next/link'
import { ArrowUpRight, BookText, Clock3, FlaskConical, Tags } from 'lucide-react'
import {
  getKnowledgeExcerpt,
  getKnowledgeSpeciesLabel,
  getKnowledgeStatusLabel,
  type KnowledgeArticle,
} from '@/lib/api/knowledge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ArticleCardProps {
  article: KnowledgeArticle
}

export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <article className="rounded-[2rem] border border-border bg-card/95 p-6 shadow-sm transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
          {article.category}
        </Badge>
        <Badge
          variant="outline"
          className={article.isPublished ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}
        >
          {getKnowledgeStatusLabel(article.isPublished)}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {article.title}
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {getKnowledgeExcerpt(article.content)}
            </p>
          </div>
          <div className="rounded-2xl bg-primary/5 p-3 text-primary">
            <BookText className="size-5" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
            <FlaskConical className="size-3.5" />
            {getKnowledgeSpeciesLabel(article.speciesType)}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            Actualizado{' '}
            {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(
              new Date(article.updatedAt),
            )}
          </span>
          {article.tags.length > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
              <Tags className="size-3.5" />
              {article.tags.slice(0, 3).join(' · ')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {article.author?.fullName || article.author?.email || 'Autor sin perfil'}
        </p>
        <Button asChild variant="outline" className="border-primary/20">
          <Link href={`/admin/knowledge/${article.id}`}>
            Abrir artículo
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </div>
    </article>
  )
}
