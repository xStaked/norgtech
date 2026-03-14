import { cn } from '@/lib/utils'

interface ArticleMarkdownPreviewProps {
  content: string
  className?: string
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_]+_)/g)

  return parts.map((part, index) => {
    if (!part) return null

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-primary/10 px-1.5 py-0.5 text-[0.95em] text-primary">
          {part.slice(1, -1)}
        </code>
      )
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }

    if (part.startsWith('_') && part.endsWith('_')) {
      return (
        <em key={index} className="italic text-foreground">
          {part.slice(1, -1)}
        </em>
      )
    }

    return <span key={index}>{part}</span>
  })
}

export function ArticleMarkdownPreview({
  content,
  className,
}: ArticleMarkdownPreviewProps) {
  const lines = content.split('\n')

  return (
    <div className={cn('space-y-4 text-sm leading-7 text-muted-foreground', className)}>
      {lines.map((rawLine, index) => {
        const line = rawLine.trimEnd()
        const trimmed = line.trim()

        if (!trimmed) {
          return <div key={index} className="h-2" />
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={index} className="text-lg font-semibold tracking-tight text-foreground">
              {renderInline(trimmed.slice(4))}
            </h3>
          )
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={index} className="text-xl font-semibold tracking-tight text-foreground">
              {renderInline(trimmed.slice(3))}
            </h2>
          )
        }

        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={index} className="text-2xl font-semibold tracking-tight text-foreground">
              {renderInline(trimmed.slice(2))}
            </h1>
          )
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={index} className="flex items-start gap-3 pl-1">
              <span className="mt-2 size-1.5 rounded-full bg-primary/70" />
              <p>{renderInline(trimmed.slice(2))}</p>
            </div>
          )
        }

        const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/)
        if (numbered) {
          return (
            <div key={index} className="grid grid-cols-[auto_1fr] gap-3">
              <span className="font-medium text-primary">{numbered[1]}.</span>
              <p>{renderInline(numbered[2])}</p>
            </div>
          )
        }

        if (trimmed.startsWith('> ')) {
          return (
            <blockquote key={index} className="border-l-2 border-primary/30 pl-4 italic text-foreground/80">
              {renderInline(trimmed.slice(2))}
            </blockquote>
          )
        }

        return <p key={index}>{renderInline(trimmed)}</p>
      })}
    </div>
  )
}
