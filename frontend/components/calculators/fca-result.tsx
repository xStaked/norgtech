'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getCalculatorSpeciesLabel,
  getFcaBenchmarkStatusLabel,
  type FcaCalculationItem,
} from '@/lib/api/calculators'
import { formatCOP } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const chartConfig = {
  current: {
    label: 'FCA actual',
    color: '#1a3a2a',
  },
  benchmark: {
    label: 'Benchmark',
    color: '#f97316',
  },
} satisfies ChartConfig

const STATUS_STYLES = {
  excellent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  watch: 'border-amber-200 bg-amber-50 text-amber-700',
  critical: 'border-rose-200 bg-rose-50 text-rose-700',
} as const

interface FcaResultProps {
  calculation: FcaCalculationItem
}

export function FcaResult({ calculation }: FcaResultProps) {
  const chartData = [
    {
      metric: 'Actual',
      current: calculation.results.fca,
      benchmark: calculation.results.benchmarkFca,
      fill: 'var(--color-current)',
    },
    {
      metric: 'Meta',
      current: calculation.results.benchmarkFca,
      benchmark: calculation.results.benchmarkFca,
      fill: 'var(--color-benchmark)',
    },
  ]

  return (
    <Card className="overflow-hidden border-primary/10 bg-card/95 shadow-sm">
      <CardHeader className="gap-5 border-b border-border/60 bg-[linear-gradient(135deg,_rgba(26,58,42,0.08),_rgba(249,115,22,0.08))]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                FCA {getCalculatorSpeciesLabel(calculation.speciesType)}
              </Badge>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[calculation.results.benchmarkStatus]}`}
              >
                {getFcaBenchmarkStatusLabel(calculation.results.benchmarkStatus)}
              </span>
            </div>
            <CardTitle className="text-2xl">
              FCA {calculation.results.fca.toFixed(2)}
            </CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {calculation.farm
                ? `${calculation.farm.name} · ${calculation.farm.client.fullName}`
                : 'Cálculo rápido sin granja vinculada'}
            </p>
          </div>

          <div className="grid min-w-[220px] gap-3 rounded-[1.75rem] border border-primary/10 bg-background/80 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                Gap vs benchmark
              </p>
              <p className="mt-1 text-3xl font-semibold text-foreground">
                {calculation.results.gapVsBenchmark >= 0 ? '+' : ''}
                {calculation.results.gapVsBenchmark.toFixed(2)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Meta</p>
                <p className="font-semibold">{calculation.results.benchmarkFca.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Mortalidad</p>
                <p className="font-semibold">{calculation.results.mortalityRate.toFixed(2)}%</p>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 p-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-border/60 bg-background/80 p-4">
            <p className="mb-4 text-sm font-medium text-foreground">
              Comparativo contra benchmark técnico
            </p>
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <BarChart data={chartData} margin={{ left: 4, right: 8, top: 20, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="metric" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={40} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent formatter={(value) => Number(value).toFixed(2)} />}
                />
                <ReferenceLine
                  y={calculation.results.benchmarkFca}
                  stroke="var(--color-benchmark)"
                  strokeDasharray="4 4"
                />
                <Bar dataKey="current" radius={[14, 14, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.metric} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="current"
                    position="top"
                    formatter={(value: number) => value.toFixed(2)}
                    className="fill-foreground text-xs font-medium"
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Ganancia total"
              value={`${calculation.results.totalWeightGainKg.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg`}
              tone="primary"
            />
            <MetricCard
              label="Biomasa final"
              value={`${calculation.results.finalBiomassKg.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg`}
              tone="orange"
            />
            <MetricCard
              label="Costo producción / kg"
              value={formatCOP(calculation.results.productionCostPerKg)}
              tone="neutral"
            />
            <MetricCard
              label="Ahorro potencial"
              value={formatCOP(calculation.results.potentialSavings)}
              tone="emerald"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-border/60 bg-background/80 p-5">
            <p className="text-sm font-medium text-foreground">Lectura operativa</p>
            <div className="mt-4 space-y-4">
              <ResultRow
                label="Aves/animales vivos"
                value={calculation.inputs.aliveBirds.toLocaleString('es-CO')}
              />
              <ResultRow
                label="Alimento consumido"
                value={`${calculation.inputs.feedConsumedKg.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg`}
              />
              <ResultRow
                label="Peso promedio"
                value={`${calculation.inputs.birdWeightKg.toFixed(2)} kg`}
              />
              <ResultRow
                label="Peso inicial estimado"
                value={`${calculation.inputs.initialWeightKg.toFixed(2)} kg`}
              />
              <ResultRow
                label="Pérdidas estimadas"
                value={formatCOP(calculation.results.estimatedLosses)}
              />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-dashed border-primary/20 bg-primary/5 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-primary">
              Decisión sugerida
            </p>
            <p className="mt-3 text-sm leading-6 text-foreground">
              {calculation.results.benchmarkStatus === 'excellent'
                ? 'El lote está en o por debajo de la meta. Mantén la formulación y usa el historial para respaldar la recomendación comercial.'
                : calculation.results.benchmarkStatus === 'watch'
                  ? 'El FCA está ligeramente por encima del objetivo. Vale la pena revisar densidad, consumo por fase y consistencia del programa sanitario.'
                  : 'El lote quedó fuera de meta. Prioriza auditoría de consumo, mortalidad y manejo para capturar el ahorro potencial antes del siguiente ciclo.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'primary' | 'orange' | 'neutral' | 'emerald'
}) {
  const toneClasses = {
    primary: 'border-primary/15 bg-primary/5',
    orange: 'border-orange-200 bg-orange-50',
    neutral: 'border-border bg-muted/30',
    emerald: 'border-emerald-200 bg-emerald-50',
  }

  return (
    <div className={`rounded-[1.5rem] border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}
