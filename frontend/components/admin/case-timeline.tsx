import { Bot, Clock3, FileText } from 'lucide-react'
import type { CaseMessage } from '@/lib/api/cases'
import { Badge } from '@/components/ui/badge'

interface CaseTimelineProps {
  messages: CaseMessage[]
}

function getMessageMeta(messageType: string) {
  if (messageType === 'status_change') {
    return {
      label: 'Cambio de estado',
      Icon: Clock3,
      className: 'bg-amber-50 text-amber-700 ring-amber-200',
    }
  }

  if (messageType === 'ai_suggestion') {
    return {
      label: 'Sugerencia AI',
      Icon: Bot,
      className: 'bg-sky-50 text-sky-700 ring-sky-200',
    }
  }

  return {
    label: 'Nota interna',
    Icon: FileText,
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }
}

export function CaseTimeline({ messages }: CaseTimelineProps) {
  const orderedMessages = [...messages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  )

  if (orderedMessages.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">
        El caso aún no tiene actividad registrada en el timeline.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {orderedMessages.map((message, index) => {
        const meta = getMessageMeta(message.messageType)
        const Icon = meta.Icon

        return (
          <div key={message.id} className="relative pl-14">
            {index < orderedMessages.length - 1 ? (
              <div className="absolute left-[1.25rem] top-10 h-[calc(100%+1rem)] w-px bg-border" />
            ) : null}
            <div className={`absolute left-0 top-1 flex size-10 items-center justify-center rounded-2xl ring-1 ${meta.className}`}>
              <Icon className="size-4" />
            </div>

            <div className="rounded-[1.5rem] border border-border/70 bg-background p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-border/80 bg-muted/30">
                    {meta.label}
                  </Badge>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {message.userId.slice(0, 8)}
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
            </div>
          </div>
        )
      })}
    </div>
  )
}
