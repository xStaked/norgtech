'use client'

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'
import type { RoiCalculationItem } from '@/lib/api/calculators'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface RoiResultProps {
  result: RoiCalculationItem | null
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function getGaugeValue(roiPercentage: number) {
  return Math.max(0, Math.min(240, roiPercentage))
}

function getStatusCopy(result: RoiCalculationItem) {
  if (result.roiPercentage >= 35) {
    return {
      title: 'Retorno sólido',
      description: 'La inversión recupera costo rápido y deja un margen operativo sano.',
      tone: 'emerald',
    }
  }

  if (result.roiPercentage >= 10) {
    return {
      title: 'Retorno controlado',
      description: 'El programa paga su costo, pero depende de una ejecución estable.',
      tone: 'amber',
    }
  }

  return {
    title: 'Retorno presionado',
    description: 'La recuperación existe, pero el ciclo queda demasiado justo.',
    tone: 'rose',
  }
}

export function RoiResult({ result }: RoiResultProps) {
  if (!result) {
    return (
      <Card className="border-dashed border-primary/20 bg-white/70">
        <CardHeader>
          <CardTitle>Resultado ROI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Ingresa ahorro, valor adicional y costo para calcular el ROI.</p>
          <p>El sistema guarda el resultado y lo deja listo para comparar contra nuevos lotes.</p>
        </CardContent>
      </Card>
    )
  }

  const status = getStatusCopy(result)
  const gaugeValue = getGaugeValue(result.roiPercentage)
  const statusTone =
    status.tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : status.tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-rose-200 bg-rose-50 text-rose-900'

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="overflow-hidden border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,253,244,0.9))]">
        <CardHeader className="pb-0">
          <CardTitle>Gauge de ROI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="mx-auto h-56 w-full max-w-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={[{ name: 'roi', value: gaugeValue, fill: '#1a3a2a' }]}
                startAngle={200}
                endAngle={-20}
                innerRadius="58%"
                outerRadius="100%"
                barSize={18}
              >
                <PolarAngleAxis type="number" domain={[0, 240]} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={18} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">ROI calculado</p>
            <p className="text-4xl font-semibold text-foreground">{result.roiPercentage.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground">
              Break-even al {result.breakEven.toFixed(1)}% del beneficio esperado
            </p>
          </div>

          <div className={cn('rounded-3xl border px-4 py-3', statusTone)}>
            <p className="text-sm font-semibold">{status.title}</p>
            <p className="mt-1 text-sm/6 opacity-90">{status.description}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 bg-white/90">
        <CardHeader>
          <CardTitle>Desglose financiero</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Ahorro alimenticio" value={formatCurrency(result.feedSavings)} />
            <MetricCard label="Valor por ganancia" value={formatCurrency(result.weightGainValue)} />
            <MetricCard label="Beneficio total" value={formatCurrency(result.totalBenefits)} />
            <MetricCard label="Costo del aditivo" value={formatCurrency(result.additiveCost)} />
          </div>

          <div className="rounded-[1.5rem] border border-primary/10 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Valor neto</p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  {formatCurrency(result.netValue)}
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>Granja: {result.farm?.name ?? 'No asociada'}</p>
                <p>Registro: {new Date(result.createdAt).toLocaleDateString('es-CO')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-border bg-background/80 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  )
}
