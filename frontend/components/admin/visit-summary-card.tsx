'use client'

import Link from 'next/link'
import { Activity, ArrowUpRight, ClipboardList, MapPin, Wheat } from 'lucide-react'
import { getVisitSpeciesLabel, type VisitListItem } from '@/lib/api/visits'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface VisitSummaryCardProps {
  visit: VisitListItem
}

function formatMetricValue(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined) {
    return 'Sin dato'
  }

  return `${value}${suffix}`
}

export function VisitSummaryCard({ visit }: VisitSummaryCardProps) {
  const isSwine = visit.farm.speciesType === 'swine'

  return (
    <Card className="overflow-hidden rounded-[1.75rem] border-border/70 bg-card/95 shadow-sm transition-transform hover:-translate-y-0.5">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
              <MapPin className="size-3.5" />
              Visita técnica
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{visit.farm.name}</h3>
              <p className="text-sm text-muted-foreground">
                {visit.client.fullName}
                {visit.client.companyName ? ` · ${visit.client.companyName}` : ''}
              </p>
            </div>
          </div>

          <Link
            href={`/admin/visits/${visit.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
          >
            Ver detalle
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border/80 bg-muted/30">
            {getVisitSpeciesLabel(visit.farm.speciesType)}
          </Badge>
          <Badge variant="outline" className="border-border/80 bg-muted/30">
            {new Intl.DateTimeFormat('es-CO', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(visit.visitDate))}
          </Badge>
          {visit.case ? (
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
              CASO-{String(visit.case.caseNumber).padStart(4, '0')}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {isSwine ? (
            <>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Animales</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatMetricValue(visit.animalCount)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ganancia diaria</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatMetricValue(visit.dailyWeightGain, ' kg')}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Consumo alimento</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatMetricValue(visit.feedConsumption, ' kg')}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Aves</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatMetricValue(visit.birdCount)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Conversión</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatMetricValue(visit.feedConversion)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Peso promedio</p>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatMetricValue(visit.avgBodyWeight, ' kg')}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-border/80 bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Activity className="size-4 text-primary" />
              Observaciones
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {visit.observations || 'No se registraron observaciones en esta visita.'}
            </p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              {visit.case ? <ClipboardList className="size-4 text-primary" /> : <Wheat className="size-4 text-primary" />}
              Recomendaciones
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {visit.recommendations || 'Sin recomendaciones registradas aún.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
