import Link from 'next/link'
import { ChevronLeft, PencilLine } from 'lucide-react'
import { ArticleForm } from '@/components/admin/article-form'
import { fetchKnowledgeArticle } from '../../_lib/server-knowledge'

interface EditKnowledgePageProps {
  params: Promise<{ id: string }>
}

export default async function EditKnowledgePage({ params }: EditKnowledgePageProps) {
  const { id } = await params
  const article = await fetchKnowledgeArticle(id)

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,_rgba(248,250,252,0.8),_rgba(255,255,255,0.96))] p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Link
          href={`/admin/knowledge/${id}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Volver al artículo
        </Link>

        <section className="rounded-[2rem] border border-primary/10 bg-card p-8 shadow-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
              <PencilLine className="size-3.5" />
              Edición técnica
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Ajustar contenido, tags o publicación
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Refina el artículo para mantener una base de conocimiento confiable, reusable y lista para consulta del equipo.
            </p>
          </div>

          <div className="mt-8">
            <ArticleForm mode="edit" article={article} />
          </div>
        </section>
      </div>
    </div>
  )
}
