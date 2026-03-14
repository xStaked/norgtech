'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, FileText, Loader2, Save } from 'lucide-react'
import {
  createKnowledgeArticle,
  updateKnowledgeArticle,
  type KnowledgeArticle,
  type KnowledgeSpeciesType,
} from '@/lib/api/knowledge'
import { ArticleMarkdownPreview } from '@/components/admin/article-markdown-preview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

interface ArticleFormProps {
  mode: 'create' | 'edit'
  article?: KnowledgeArticle
}

interface ArticleFormState {
  title: string
  category: string
  speciesType: KnowledgeSpeciesType
  tags: string
  isPublished: boolean
  content: string
}

function toInitialState(article?: KnowledgeArticle): ArticleFormState {
  return {
    title: article?.title ?? '',
    category: article?.category ?? '',
    speciesType: (article?.speciesType as KnowledgeSpeciesType) ?? 'both',
    tags: article?.tags.join(', ') ?? '',
    isPublished: article?.isPublished ?? false,
    content: article?.content ?? '',
  }
}

export function ArticleForm({ mode, article }: ArticleFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<ArticleFormState>(() => toInitialState(article))
  const [error, setError] = useState<string | null>(null)

  const parsedTags = useMemo(
    () =>
      values.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    [values.tags],
  )

  const updateField = <K extends keyof ArticleFormState>(key: K, value: ArticleFormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!values.title.trim()) {
      setError('El título del artículo es obligatorio.')
      return
    }

    if (!values.category.trim()) {
      setError('La categoría es obligatoria.')
      return
    }

    if (!values.content.trim()) {
      setError('Debes redactar el contenido técnico del artículo.')
      return
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = {
            title: values.title.trim(),
            category: values.category.trim(),
            speciesType: values.speciesType,
            tags: parsedTags,
            isPublished: values.isPublished,
            content: values.content.trim(),
          }

          const response =
            mode === 'create'
              ? await createKnowledgeArticle(payload)
              : await updateKnowledgeArticle(article!.id, payload)

          router.push(`/admin/knowledge/${response.id}`)
          router.refresh()
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo guardar el artículo.',
          )
        }
      })()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={values.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="Ej. Protocolo para diagnóstico inicial de diarreas en cerdos"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoría</Label>
              <Input
                id="category"
                value={values.category}
                onChange={(event) => updateField('category', event.target.value)}
                placeholder="Sanidad, Nutrición, Bioseguridad..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="speciesType">Especie</Label>
              <select
                id="speciesType"
                value={values.speciesType}
                onChange={(event) =>
                  updateField('speciesType', event.target.value as KnowledgeSpeciesType)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring"
              >
                <option value="both">Ambas especies</option>
                <option value="poultry">Avícola</option>
                <option value="swine">Porcino</option>
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={values.tags}
                onChange={(event) => updateField('tags', event.target.value)}
                placeholder="ventilación, consumo, bioseguridad"
              />
              <p className="text-xs text-muted-foreground">
                Separa las etiquetas por coma para mejorar búsquedas y clasificación.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Contenido en markdown</Label>
            <Textarea
              id="content"
              value={values.content}
              onChange={(event) => updateField('content', event.target.value)}
              className="min-h-[420px] font-mono text-sm"
              placeholder={'# Título\n\n## Diagnóstico\n\n- Hallazgo 1\n- Hallazgo 2\n\n## Recomendación\n\nDescribe el protocolo o guía técnica.'}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-primary/10 bg-primary/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Estado del artículo</p>
                <p className="text-sm text-muted-foreground">
                  {values.isPublished
                    ? 'Quedará disponible para consulta inmediata.'
                    : 'Se guardará como borrador interno.'}
                </p>
              </div>
              <Switch
                checked={values.isPublished}
                onCheckedChange={(checked) => updateField('isPublished', checked)}
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <Eye className="size-4 text-primary" />
              <h2 className="font-medium text-foreground">Preview</h2>
            </div>
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap gap-2">
                {parsedTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {values.category || 'Sin categoría'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {values.title || 'Título del artículo'}
                </h2>
              </div>

              <ArticleMarkdownPreview
                content={
                  values.content ||
                  'Escribe el contenido técnico en markdown para visualizarlo aquí.'
                }
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <FileText className="size-4 text-primary" />
          {mode === 'create'
            ? 'El artículo quedará indexado para búsqueda técnica dentro del panel.'
            : 'Los cambios impactan el detalle y los resultados de búsqueda del artículo.'}
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {mode === 'create' ? 'Guardar artículo' : 'Actualizar artículo'}
        </Button>
      </div>
    </form>
  )
}
