import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Scale, Fish, TrendingDown } from 'lucide-react'
import { HarvestForm } from '@/components/harvest-form'
import { type HarvestRecord, type BatchForForms } from '../types'

interface HarvestTabProps {
  harvests: HarvestRecord[]
  batchesForForms: BatchForForms[]
}

export function HarvestTab({ harvests, batchesForForms }: HarvestTabProps) {
  const withEvisceration = harvests.filter(h => h.avg_weight_eviscerated_g != null)
  const avgShrinkage = withEvisceration.length > 0
    ? withEvisceration.reduce((s, h) => {
        const pct = ((h.avg_weight_whole_g - h.avg_weight_eviscerated_g!) / h.avg_weight_whole_g) * 100
        return s + pct
      }, 0) / withEvisceration.length
    : null
  const totalWholeKg = harvests.reduce((s, h) => s + h.total_animals * h.avg_weight_whole_g / 1000, 0)
  const totalEviscKg = harvests.filter(h => h.avg_weight_eviscerated_g).reduce(
    (s, h) => s + h.total_animals * h.avg_weight_eviscerated_g! / 1000, 0
  )

  return (
    <div className="flex flex-col gap-6">
      {harvests.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Biomasa total cosechada</CardTitle>
              <Scale className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalWholeKg.toFixed(1)} <span className="text-sm font-normal">kg</span></div>
              <p className="text-xs text-muted-foreground">Peso entero</p>
            </CardContent>
          </Card>

          <Card className="transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Biomasa eviscerada</CardTitle>
              <Fish className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEviscKg.toFixed(1)} <span className="text-sm font-normal">kg</span></div>
              <p className="text-xs text-muted-foreground">Viscera: {(totalWholeKg - totalEviscKg).toFixed(1)} kg</p>
            </CardContent>
          </Card>

          <Card className="transition-all hover:shadow-md border-destructive/20 bg-destructive/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Merma promedio</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {avgShrinkage != null ? `${avgShrinkage.toFixed(1)}%` : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Pérdida al eviscerado</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registro de cosechas</CardTitle>
          <CardDescription>
            Controla la merma real: diferencia entre peso entero y peso eviscerado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HarvestForm batches={batchesForForms} harvests={harvests} />
        </CardContent>
      </Card>
    </div>
  )
}
