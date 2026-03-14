import { Calculator, ChevronRight, History, Wheat } from 'lucide-react'
import { CalculatorNav } from '@/components/calculators/calculator-nav'
import { FcaForm } from '@/components/calculators/fca-form'
import { Badge } from '@/components/ui/badge'
import { fetchFarms } from '../../farms/_lib/server-farms'
import { fetchFcaHistory } from '../_lib/server-calculators'

export default async function FcaCalculatorPage() {
  const [farms, history] = await Promise.all([fetchFarms(), fetchFcaHistory()])

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(26,58,42,0.08),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.14),_transparent_24%),linear-gradient(180deg,_rgba(255,251,235,0.65),_rgba(255,255,255,0.95))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                  <Calculator className="mr-1 size-3.5" />
                  Calculadoras técnicas
                </Badge>
                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                  Fase 5A
                </Badge>
              </div>

              <div className="space-y-2">
                <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  FCA con benchmark operativo, costo por kilo y memoria de cada lote.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Esta vista concentra el cálculo técnico del índice de conversión alimenticia para que el asesor relacione desempeño, mortalidad y ahorro potencial en una sola lectura.
                </p>
              </div>
              <CalculatorNav />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeaderStat
                icon={Wheat}
                label="Granjas disponibles"
                value={farms.items.length.toString()}
                tone="primary"
              />
              <HeaderStat
                icon={History}
                label="Historial cargado"
                value={history.meta.total.toString()}
                tone="orange"
              />
              <HeaderStat
                icon={ChevronRight}
                label="Módulo ROI"
                value="Listo"
                tone="neutral"
              />
            </div>
          </div>
        </section>

        <FcaForm farms={farms.items} initialHistory={history.items} />
      </div>
    </div>
  )
}

function HeaderStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Calculator
  label: string
  value: string
  tone: 'primary' | 'orange' | 'neutral'
}) {
  const toneClasses = {
    primary: 'border-primary/15 bg-primary/5',
    orange: 'border-orange-200 bg-orange-50',
    neutral: 'border-border bg-background/80',
  }

  return (
    <div className={`rounded-[1.5rem] border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  )
}
