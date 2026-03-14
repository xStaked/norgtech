import { Bot, Clock3, FileText, ShieldCheck } from 'lucide-react'
import type { CaseMessage } from '@/lib/api/cases'
import { Badge } from '@/components/ui/badge'

interface CaseStatusTimelineProps {
  messages: CaseMessage[]
}

function getMessageMeta(message: CaseMessage) {
  if (message.messageType === 'status_change') {
    return {
      label: 'Cambio de estado',
      Icon: Clock3,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  if (message.messageType === 'ai_suggestion') {
    return {
      label: 'Sugerencia técnica',
      Icon: Bot,
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    }
  }

  return {
    label: 'Actualización',
    Icon: FileText,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
}

export function CaseStatusTimeline({ messages }: CaseStatusTimelineProps) {
  const ordered = [...messages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  )

  if (ordered.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-border bg-background/80 px-5 py-10 text-center text-sm text-muted-foreground">
        Aún no hay actualizaciones visibles para este caso.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {ordered.map((message, index) => {
        const meta = getMessageMeta(message)
        const Icon = meta.Icon

        return (
          <div key={message.id} className="relative pl-14">
            {index < ordered.length - 1 ? (
              <div className="absolute left-[1.22rem] top-10 h-[calc(100%+1rem)] w-px bg-border" />
            ) : null}

            <div className="absolute left-0 top-1 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="size-4" />
            </div>

            <div className="rounded-[1.5rem] border border-primary/10 bg-white/90 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={meta.className}>
                    {meta.label}
                  </Badge>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {message.author?.fullName || message.author?.email || 'Equipo Norgtech'}
                  </span>
                </div>
                <time className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(message.createdAt))}
                </time>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {message.content}
              </p>

              {message.messageType === 'status_change' ? (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                  <ShieldCheck className="size-3.5" />
                  Seguimiento actualizado
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
