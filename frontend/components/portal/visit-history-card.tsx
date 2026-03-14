import { CalendarClock, ClipboardCheck, FlaskConical, Sprout } from 'lucide-react'
import type { VisitListItem } from '@/lib/api/visits'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getVisitSpeciesLabel } from '@/lib/api/visits'

interface VisitHistoryCardProps {
  visit: VisitListItem
}

export function VisitHistoryCard({ visit }: VisitHistoryCardProps) {
  return (
    <Card className="rounded-[1.75rem] border-primary/10 bg-white/90 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarClock className="size-4 text-primary" />
              {new Intl.DateTimeFormat('es-CO', {
                dateStyle: 'full',
              }).format(new Date(visit.visitDate))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                <Sprout className="mr-1 size-3.5" />
                {visit.farm.name}
              </Badge>
              <Badge variant="outline">
                {getVisitSpeciesLabel(visit.farm.speciesType)}
              </Badge>
            </div>
          </div>

          {visit.case ? (
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
              Caso #{visit.case.caseNumber}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ClipboardCheck className="size-4 text-primary" />
              Observaciones
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {visit.observations || 'Sin observaciones registradas en esta visita.'}
            </p>
          </div>
          <div className="rounded-2xl bg-orange-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
              <FlaskConical className="size-4" />
              Recomendaciones
            </div>
            <p className="mt-2 text-sm leading-6 text-orange-900">
              {visit.recommendations || 'No se registraron recomendaciones pendientes.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
