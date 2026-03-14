'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { AlertTriangle, Loader2, Orbit } from 'lucide-react'
import {
  getProductionProgramLabel,
  runProductionSimulation,
  type ProductionProgram,
  type ProductionSimulationResult,
} from '@/lib/api/calculators'
import type { FarmListItem } from '@/lib/api/farms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimulationChart } from './simulation-chart'

const EMPTY_FARM_VALUE = '__all_farms__'

const PROGRAM_PRESETS: Record<
  ProductionProgram,
  {
    initialAnimalCount: string
    startingWeightKg: string
    targetWeightKg: string
    cycleWeeks: string
    weeklyMortalityRatePct: string
    feedConversionRate: string
    feedCostPerKg: string
    salePricePerKg: string
  }
> = {
  broiler: {
    initialAnimalCount: '12000',
    startingWeightKg: '0.045',
    targetWeightKg: '2.4',
    cycleWeeks: '7',
    weeklyMortalityRatePct: '0.7',
    feedConversionRate: '1.62',
    feedCostPerKg: '0.48',
    salePricePerKg: '1.45',
  },
  layer: {
    initialAnimalCount: '9000',
    startingWeightKg: '0.04',
    targetWeightKg: '1.8',
    cycleWeeks: '16',
    weeklyMortalityRatePct: '0.35',
    feedConversionRate: '1.88',
    feedCostPerKg: '0.46',
    salePricePerKg: '1.38',
  },
  swine: {
    initialAnimalCount: '1800',
    startingWeightKg: '7.2',
    targetWeightKg: '118',
    cycleWeeks: '20',
    weeklyMortalityRatePct: '0.18',
    feedConversionRate: '2.55',
    feedCostPerKg: '0.42',
    salePricePerKg: '1.62',
  },
}

interface SimulationState {
  programType: ProductionProgram
  farmId: string
  initialAnimalCount: string
  startingWeightKg: string
  targetWeightKg: string
  cycleWeeks: string
  weeklyMortalityRatePct: string
  feedConversionRate: string
  feedCostPerKg: string
  salePricePerKg: string
}

interface ProductionSimFormProps {
  farms: FarmListItem[]
}

function toInitialState(): SimulationState {
  return {
    programType: 'broiler',
    farmId: '',
    ...PROGRAM_PRESETS.broiler,
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function ProductionSimForm({ farms }: ProductionSimFormProps) {
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<SimulationState>(() => toInitialState())
  const [result, setResult] = useState<ProductionSimulationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValues((current) => ({
      ...current,
      ...PROGRAM_PRESETS[current.programType],
    }))
  }, [values.programType])

  const selectedFarm = farms.find((farm) => farm.id === values.farmId)
  const speciesMismatch =
    selectedFarm &&
    ((selectedFarm.speciesType === 'swine' && values.programType !== 'swine') ||
      (selectedFarm.speciesType === 'poultry' && values.programType === 'swine'))

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    startTransition(() => {
      void (async () => {
        try {
          const simulation = await runProductionSimulation({
            programType: values.programType,
            farmId: values.farmId || undefined,
            initialAnimalCount: Number(values.initialAnimalCount),
            startingWeightKg: Number(values.startingWeightKg),
            targetWeightKg: Number(values.targetWeightKg),
            cycleWeeks: Number(values.cycleWeeks),
            weeklyMortalityRatePct: Number(values.weeklyMortalityRatePct),
            feedConversionRate: Number(values.feedConversionRate),
            feedCostPerKg: Number(values.feedCostPerKg),
            salePricePerKg: Number(values.salePricePerKg),
          })

          setResult(simulation)
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo ejecutar la simulación.',
          )
        }
      })()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <Card className="border-primary/10 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Orbit className="size-5 text-primary" />
            Simulador de producción
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="programType">Programa</Label>
                <Select
                  value={values.programType}
                  onValueChange={(programType) =>
                    setValues((current) => ({
                      ...current,
                      programType: programType as ProductionProgram,
                    }))
                  }
                >
                  <SelectTrigger id="programType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="broiler">Broiler</SelectItem>
                    <SelectItem value="layer">Ponedora</SelectItem>
                    <SelectItem value="swine">Cerdo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="farmId">Granja de referencia</Label>
                <Select
                  value={values.farmId || EMPTY_FARM_VALUE}
                  onValueChange={(farmId) =>
                    setValues((current) => ({
                      ...current,
                      farmId: farmId === EMPTY_FARM_VALUE ? '' : farmId,
                    }))
                  }
                >
                  <SelectTrigger id="farmId">
                    <SelectValue placeholder="Contexto opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_FARM_VALUE}>Sin granja asociada</SelectItem>
                    {farms.map((farm) => (
                      <SelectItem key={farm.id} value={farm.id}>
                        {farm.name} · {farm.client.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {speciesMismatch ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>
                    La granja seleccionada es de tipo {selectedFarm.speciesType}. El programa actual es{' '}
                    {getProductionProgramLabel(values.programType).toLowerCase()}.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <NumberField id="initialAnimalCount" label="Animales iniciales" value={values.initialAnimalCount} onChange={(initialAnimalCount) => setValues((current) => ({ ...current, initialAnimalCount }))} />
              <NumberField id="cycleWeeks" label="Semanas de ciclo" value={values.cycleWeeks} onChange={(cycleWeeks) => setValues((current) => ({ ...current, cycleWeeks }))} />
              <NumberField id="startingWeightKg" label="Peso inicial kg" value={values.startingWeightKg} onChange={(startingWeightKg) => setValues((current) => ({ ...current, startingWeightKg }))} />
              <NumberField id="targetWeightKg" label="Peso objetivo kg" value={values.targetWeightKg} onChange={(targetWeightKg) => setValues((current) => ({ ...current, targetWeightKg }))} />
              <NumberField id="weeklyMortalityRatePct" label="Mortalidad semanal %" value={values.weeklyMortalityRatePct} onChange={(weeklyMortalityRatePct) => setValues((current) => ({ ...current, weeklyMortalityRatePct }))} />
              <NumberField id="feedConversionRate" label="Conversión alimenticia" value={values.feedConversionRate} onChange={(feedConversionRate) => setValues((current) => ({ ...current, feedConversionRate }))} />
              <NumberField id="feedCostPerKg" label="Costo alimento kg" value={values.feedCostPerKg} onChange={(feedCostPerKg) => setValues((current) => ({ ...current, feedCostPerKg }))} />
              <NumberField id="salePricePerKg" label="Precio venta kg" value={values.salePricePerKg} onChange={(salePricePerKg) => setValues((current) => ({ ...current, salePricePerKg }))} />
            </div>

            {error ? (
              <div className="rounded-2xl border border-destructive/15 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Simular escenario
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-primary/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.92))]">
          <CardHeader>
            <CardTitle>Proyección semanal</CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <SimulationChart data={result.weeklyProjection} />
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-primary/20 bg-white/70 p-6 text-sm text-muted-foreground">
                Corre la simulación para ver biomasa, margen y alimento acumulado semana a semana.
              </div>
            )}
          </CardContent>
        </Card>

        {result ? (
          <Card className="border-primary/10 bg-white/90">
            <CardHeader>
              <CardTitle>Resumen de cierre</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <MetricCard label="Animales vivos al cierre" value={String(result.summary.finalAnimalsAlive)} />
              <MetricCard label="Mortalidad acumulada" value={`${result.summary.totalMortalityPct.toFixed(2)}%`} />
              <MetricCard label="Biomasa final" value={`${result.summary.finalBiomassKg.toLocaleString('es-CO')} kg`} />
              <MetricCard label="Margen proyectado" value={formatCurrency(result.summary.projectedMargin)} />
              <MetricCard label="Feed acumulado" value={`${result.summary.totalFeedKg.toLocaleString('es-CO')} kg`} />
              <MetricCard label="Margen por animal" value={formatCurrency(result.summary.marginPerAnimal)} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-border bg-background/80 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  )
}
