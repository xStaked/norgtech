import Link from 'next/link'
import { BookOpenText, ChevronLeft } from 'lucide-react'
import { ArticleForm } from '@/components/admin/article-form'

export default function NewKnowledgePage() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,_rgba(240,253,244,0.65),_rgba(255,255,255,0.95))] p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Link
          href="/admin/knowledge"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Volver a base de conocimiento
        </Link>

        <section className="rounded-[2rem] border border-primary/10 bg-card p-8 shadow-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
              <BookOpenText className="size-3.5" />
              Nuevo artículo técnico
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Documentar criterio, protocolo o recomendación
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Redacta conocimiento operativo con formato markdown, tags y estado de publicación para que el equipo lo reutilice.
            </p>
          </div>

          <div className="mt-8">
            <ArticleForm mode="create" />
          </div>
        </section>
      </div>
    </div>
  )
}
