'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Beaker, Loader2, Target, TrendingDown } from 'lucide-react'
import type { FarmListItem } from '@/lib/api/farms'
import {
  calculateFca,
  getCalculatorSpeciesLabel,
  getFcaBenchmarkStatusLabel,
  type CalculatorSpecies,
  type FcaCalculationItem,
} from '@/lib/api/calculators'
import { formatCOP } from '@/lib/format'
import { FcaResult } from '@/components/calculators/fca-result'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface FcaFormProps {
  farms: FarmListItem[]
  initialHistory: FcaCalculationItem[]
}

interface FcaFormState {
  farmId: string
  speciesType: CalculatorSpecies
  birdCount: string
  mortalityCount: string
  feedConsumedKg: string
  birdWeightKg: string
  initialWeightKg: string
  feedCostPerKg: string
  marketPricePerKg: string
  benchmarkFca: string
}

const DEFAULTS: Record<CalculatorSpecies, { initialWeightKg: string; benchmarkFca: string }> = {
  poultry: { initialWeightKg: '0.04', benchmarkFca: '1.68' },
  swine: { initialWeightKg: '6', benchmarkFca: '2.65' },
}

const EMPTY_STATE: FcaFormState = {
  farmId: 'none',
  speciesType: 'poultry',
  birdCount: '',
  mortalityCount: '0',
  feedConsumedKg: '',
  birdWeightKg: '',
  initialWeightKg: DEFAULTS.poultry.initialWeightKg,
  feedCostPerKg: '',
  marketPricePerKg: '',
  benchmarkFca: DEFAULTS.poultry.benchmarkFca,
}

export function FcaForm({ farms, initialHistory }: FcaFormProps) {
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<FcaFormState>(EMPTY_STATE)
  const [result, setResult] = useState<FcaCalculationItem | null>(initialHistory[0] ?? null)
  const [history, setHistory] = useState<FcaCalculationItem[]>(initialHistory)
  const [error, setError] = useState<string | null>(null)

  const selectedFarm =
    values.farmId !== 'none' ? farms.find((farm) => farm.id === values.farmId) ?? null : null

  const handleSpeciesChange = (speciesType: CalculatorSpecies) => {
    const defaults = DEFAULTS[speciesType]
    setValues((current) => ({
      ...current,
      speciesType,
      initialWeightKg: current.initialWeightKg ? current.initialWeightKg : defaults.initialWeightKg,
      benchmarkFca: current.benchmarkFca ? current.benchmarkFca : defaults.benchmarkFca,
    }))
  }

  const handleFarmChange = (farmId: string) => {
    const farm = farms.find((item) => item.id === farmId)
    const speciesType = (farm?.speciesType as CalculatorSpecies | undefined) ?? values.speciesType
    const defaults = DEFAULTS[speciesType]

    setValues((current) => ({
      ...current,
      farmId,
      speciesType,
      initialWeightKg: current.initialWeightKg || defaults.initialWeightKg,
      benchmarkFca: current.benchmarkFca || defaults.benchmarkFca,
    }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const birdCount = Number(values.birdCount)
    const mortalityCount = Number(values.mortalityCount || '0')
    const feedConsumedKg = Number(values.feedConsumedKg)
    const birdWeightKg = Number(values.birdWeightKg)
    const initialWeightKg = Number(values.initialWeightKg)
    const feedCostPerKg = Number(values.feedCostPerKg)
    const marketPricePerKg = values.marketPricePerKg ? Number(values.marketPricePerKg) : undefined
    const benchmarkFca = values.benchmarkFca ? Number(values.benchmarkFca) : undefined

    if (!Number.isFinite(birdCount) || birdCount <= 0) {
      setError('Ingresa un tamaño de lote válido.')
      return
    }

    if (!Number.isFinite(feedConsumedKg) || feedConsumedKg <= 0) {
      setError('El consumo total de alimento debe ser mayor a cero.')
      return
    }

    if (!Number.isFinite(birdWeightKg) || birdWeightKg <= 0) {
      setError('El peso promedio final debe ser mayor a cero.')
      return
    }

    if (!Number.isFinite(feedCostPerKg) || feedCostPerKg <= 0) {
      setError('El costo del alimento por kg debe ser válido.')
      return
    }

    startTransition(() => {
      void (async () => {
        try {
          const calculation = await calculateFca({
            farmId: values.farmId !== 'none' ? values.farmId : undefined,
            speciesType: values.speciesType,
            birdCount,
            mortalityCount,
            feedConsumedKg,
            birdWeightKg,
            initialWeightKg,
            feedCostPerKg,
            marketPricePerKg,
            benchmarkFca,
          })

          setResult(calculation)
          setHistory((current) => [calculation, ...current.filter((item) => item.id !== calculation.id)].slice(0, 20))
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo calcular el FCA.',
          )
        }
      })()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card className="overflow-hidden border-primary/10 bg-card/95 shadow-sm">
        <CardContent className="p-0">
          <div className="border-b border-border/60 bg-[linear-gradient(135deg,_rgba(26,58,42,0.08),_rgba(249,115,22,0.08))] p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
              <Beaker className="size-3.5" />
              Diagnóstico FCA
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              Calcula la conversión alimenticia y deja trazabilidad técnica.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Usa el lote actual para contrastar contra benchmark, costo por kg producido y pérdidas ligadas a mortalidad.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="farmId">Granja vinculada</Label>
                <Select value={values.farmId} onValueChange={handleFarmChange}>
                  <SelectTrigger id="farmId">
                    <SelectValue placeholder="Selecciona una granja o deja cálculo rápido" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cálculo rápido sin granja</SelectItem>
                    {farms.map((farm) => (
                      <SelectItem key={farm.id} value={farm.id}>
                        {farm.name} · {farm.client.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="speciesType">Especie</Label>
                <Select value={values.speciesType} onValueChange={handleSpeciesChange}>
                  <SelectTrigger id="speciesType" disabled={Boolean(selectedFarm)}>
                    <SelectValue placeholder="Selecciona la especie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="poultry">Avícola</SelectItem>
                    <SelectItem value="swine">Porcino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="benchmarkFca">Benchmark objetivo</Label>
                <Input
                  id="benchmarkFca"
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.benchmarkFca}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, benchmarkFca: event.target.value }))
                  }
                  placeholder={DEFAULTS[values.speciesType].benchmarkFca}
                />
              </div>

              <NumericField
                id="birdCount"
                label="Animales iniciales"
                value={values.birdCount}
                onChange={(birdCount) => setValues((current) => ({ ...current, birdCount }))}
                placeholder="12000"
              />
              <NumericField
                id="mortalityCount"
                label="Mortalidad"
                value={values.mortalityCount}
                onChange={(mortalityCount) =>
                  setValues((current) => ({ ...current, mortalityCount }))
                }
                placeholder="180"
              />
              <NumericField
                id="feedConsumedKg"
                label="Alimento consumido (kg)"
                value={values.feedConsumedKg}
                onChange={(feedConsumedKg) =>
                  setValues((current) => ({ ...current, feedConsumedKg }))
                }
                placeholder="22850"
              />
              <NumericField
                id="birdWeightKg"
                label="Peso promedio final (kg)"
                value={values.birdWeightKg}
                onChange={(birdWeightKg) =>
                  setValues((current) => ({ ...current, birdWeightKg }))
                }
                placeholder={values.speciesType === 'poultry' ? '2.36' : '118'}
              />
              <NumericField
                id="initialWeightKg"
                label="Peso inicial estimado (kg)"
                value={values.initialWeightKg}
                onChange={(initialWeightKg) =>
                  setValues((current) => ({ ...current, initialWeightKg }))
                }
                placeholder={DEFAULTS[values.speciesType].initialWeightKg}
              />
              <NumericField
                id="feedCostPerKg"
                label="Costo alimento / kg"
                value={values.feedCostPerKg}
                onChange={(feedCostPerKg) =>
                  setValues((current) => ({ ...current, feedCostPerKg }))
                }
                placeholder="1900"
              />
              <NumericField
                id="marketPricePerKg"
                label="Precio mercado / kg"
                value={values.marketPricePerKg}
                onChange={(marketPricePerKg) =>
                  setValues((current) => ({ ...current, marketPricePerKg }))
                }
                placeholder="6200"
              />
            </div>

            {selectedFarm ? (
              <div className="rounded-[1.5rem] border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-foreground">
                La granja <strong>{selectedFarm.name}</strong> fija la especie en{' '}
                <strong>{getCalculatorSpeciesLabel(selectedFarm.speciesType)}</strong>.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[1.5rem] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-primary/10 bg-primary/5 px-4 py-4">
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-primary">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1">
                  <Target className="size-3.5" />
                  Benchmark editable
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1">
                  <TrendingDown className="size-3.5" />
                  Historial persistido
                </span>
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Calcular FCA
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {result ? (
          <FcaResult calculation={result} />
        ) : (
          <Card className="border-dashed border-primary/20 bg-card/80">
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <div className="rounded-full border border-primary/15 bg-primary/5 p-4 text-primary">
                <Beaker className="size-8" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-foreground">
                Ejecuta el primer cálculo
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Cuando completes el formulario, aquí verás el benchmark, el costo por kg y la señal de ahorro potencial del lote.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden border-border bg-card/95 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Historial reciente</p>
                <p className="text-sm text-muted-foreground">
                  Últimos 20 cálculos FCA del usuario autenticado.
                </p>
              </div>
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                {history.length} registros
              </Badge>
            </div>

            <div className="divide-y divide-border/60">
              {history.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                  Aún no hay cálculos guardados.
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="grid gap-3 px-6 py-4 md:grid-cols-[1.1fr_0.7fr_0.7fr] md:items-center">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {item.farm ? item.farm.name : 'Cálculo rápido'} ·{' '}
                        {getCalculatorSpeciesLabel(item.speciesType)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.farm?.client.fullName ?? 'Sin productor asociado'} ·{' '}
                        {new Date(item.createdAt).toLocaleString('es-CO', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Resultado
                      </p>
                      <p className="mt-1 text-lg font-semibold text-foreground">
                        {item.results.fca.toFixed(2)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        Impacto
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {getFcaBenchmarkStatusLabel(item.results.benchmarkStatus)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Ahorro: {formatCOP(item.results.potentialSavings)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function NumericField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
