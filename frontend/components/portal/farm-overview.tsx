import { Bird, PiggyBank, Sprout, Warehouse } from 'lucide-react'
import type { ProducerFarmListItem } from '@/lib/api/portal-farms'
import type { VisitListItem } from '@/lib/api/visits'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getFarmSpeciesLabel } from '@/lib/api/portal-farms'
import { VisitHistoryCard } from '@/components/portal/visit-history-card'

interface FarmOverviewProps {
  farms: ProducerFarmListItem[]
  visits: VisitListItem[]
}

export function FarmOverview({ farms, visits }: FarmOverviewProps) {
  if (farms.length === 0) {
    return (
      <Card className="rounded-[2rem] border-dashed border-primary/20 bg-white/80">
        <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
          Aún no tienes granjas registradas para mostrar en el portal.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {farms.map((farm) => {
        const farmVisits = visits.filter((visit) => visit.farmId === farm.id)
        const SpeciesIcon = farm.speciesType === 'swine' ? PiggyBank : Bird

        return (
          <Card key={farm.id} className="overflow-hidden rounded-[2rem] border-primary/10 bg-white/90 shadow-sm">
            <CardHeader className="border-b border-primary/10 bg-[linear-gradient(135deg,_rgba(22,101,52,0.08),_rgba(249,115,22,0.08))]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <Badge className="w-fit gap-1 bg-primary/15 text-primary hover:bg-primary/15">
                    <SpeciesIcon className="size-3.5" />
                    {getFarmSpeciesLabel(farm.speciesType)}
                  </Badge>
                  <div>
                    <CardTitle className="text-2xl">{farm.name}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {farm.location || 'Ubicación pendiente'} {farm.client.companyName ? `· ${farm.client.companyName}` : ''}
                    </p>
                  </div>
                </div>

                <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Capacidad</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {farm.capacity?.toLocaleString('es-CO') || 'N/D'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Actividad</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {farm._count?.visits ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Warehouse className="size-4" />
                    Especie y escala
                  </div>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {getFarmSpeciesLabel(farm.speciesType)} con capacidad de{' '}
                    {farm.capacity?.toLocaleString('es-CO') || 'capacidad no definida'} animales.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Sprout className="size-4 text-primary" />
                    Casos asociados
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {farm._count?.cases ?? 0} casos registrados sobre esta operación.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <PiggyBank className="size-4 text-primary" />
                    Seguimiento técnico
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {farmVisits.length > 0
                      ? `Última visita el ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(farmVisits[0].visitDate))}.`
                      : 'Todavía no hay visitas registradas para esta granja.'}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Historial de visitas
                </h3>
                {farmVisits.length > 0 ? (
                  <div className="space-y-4">
                    {farmVisits.map((visit) => (
                      <VisitHistoryCard key={visit.id} visit={visit} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                    No hay visitas para esta granja todavía.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
