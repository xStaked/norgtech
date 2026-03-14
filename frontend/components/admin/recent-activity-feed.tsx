import Link from 'next/link'
import { ArrowUpRight, FileText, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardActivityItem } from '@/lib/api/dashboard'

interface RecentActivityFeedProps {
  items: DashboardActivityItem[]
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function RecentActivityFeed({ items }: RecentActivityFeedProps) {
  return (
    <Card className="rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl">Actividad reciente</CardTitle>
        <CardDescription>
          Eventos más frescos del soporte técnico y la operación de campo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              href={item.href}
              className="group flex items-start gap-4 rounded-3xl border border-border/70 bg-background/70 p-4 transition-colors hover:border-primary/20 hover:bg-primary/5"
            >
              <div
                className={`rounded-2xl p-3 ${
                  item.tone === 'warning'
                    ? 'bg-orange-50 text-orange-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {item.type === 'case' ? <FileText className="size-4" /> : <MapPin className="size-4" />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      item.tone === 'warning'
                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }
                  >
                    {item.type === 'case' ? 'Caso' : 'Visita'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{item.meta}</span>
                </div>
                <div>
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{formatActivityDate(item.createdAt)}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Abrir detalle
                    <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Todavía no hay actividad reciente para mostrar en este tablero.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
