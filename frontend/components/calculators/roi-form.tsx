'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Loader2, Sigma } from 'lucide-react'
import {
  calculateRoi,
  type RoiCalculationItem,
} from '@/lib/api/calculators'
import type { FarmListItem } from '@/lib/api/farms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RoiResult } from './roi-result'

const EMPTY_FARM_VALUE = '__all_farms__'

interface RoiFormProps {
  farms: FarmListItem[]
  initialHistory: RoiCalculationItem[]
}

interface RoiState {
  farmId: string
  feedSavings: string
  weightGainValue: string
  additiveCost: string
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function RoiForm({ farms, initialHistory }: RoiFormProps) {
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<RoiState>({
    farmId: '',
    feedSavings: '1250',
    weightGainValue: '980',
    additiveCost: '600',
  })
  const [history, setHistory] = useState(initialHistory)
  const [currentResult, setCurrentResult] = useState<RoiCalculationItem | null>(initialHistory[0] ?? null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    startTransition(() => {
      void (async () => {
        try {
          const result = await calculateRoi({
            farmId: values.farmId || undefined,
            feedSavings: Number(values.feedSavings),
            weightGainValue: Number(values.weightGainValue),
            additiveCost: Number(values.additiveCost),
          })

          setCurrentResult(result)
          setHistory((current) => [result, ...current.filter((item) => item.id !== result.id)].slice(0, 8))
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo calcular el ROI.',
          )
        }
      })()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
      <div className="space-y-6">
        <Card className="border-primary/10 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sigma className="size-5 text-primary" />
              Calculadora ROI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="farmId">Granja asociada</Label>
                <Select
                  value={values.farmId || EMPTY_FARM_VALUE}
                  onValueChange={(farmId) =>
                    setValues((current) => ({
                      ...current,
                      farmId: farmId === EMPTY_FARM_VALUE ? '' : farmId,
                    }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="farmId">
                    <SelectValue placeholder="Selecciona una granja para guardar contexto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_FARM_VALUE}>Sin granja específica</SelectItem>
                    {farms.map((farm) => (
                      <SelectItem key={farm.id} value={farm.id}>
                        {farm.name} · {farm.client.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <NumberField id="feedSavings" label="Ahorro alimenticio" value={values.feedSavings} onChange={(feedSavings) => setValues((current) => ({ ...current, feedSavings }))} disabled={isPending} />
                <NumberField id="weightGainValue" label="Valor por ganancia" value={values.weightGainValue} onChange={(weightGainValue) => setValues((current) => ({ ...current, weightGainValue }))} disabled={isPending} />
              </div>

              <NumberField
                id="additiveCost"
                label="Costo del aditivo"
                value={values.additiveCost}
                onChange={(additiveCost) =>
                  setValues((current) => ({ ...current, additiveCost }))
                }
                disabled={isPending}
              />

              {error ? (
                <div className="rounded-2xl border border-destructive/15 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Calcular y guardar ROI
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-primary/10 bg-white/80">
          <CardHeader>
            <CardTitle>Historial reciente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay cálculos guardados para tu usuario.</p>
            ) : (
              history.map((item) => (
                <div key={item.id} className="rounded-[1.25rem] border border-border bg-background/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.farm?.name ?? 'Cálculo sin granja'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString('es-CO')}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-primary">{item.roiPercentage.toFixed(1)}%</p>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <span>Ahorro: {formatCurrency(item.feedSavings)}</span>
                    <span>Ganancia: {formatCurrency(item.weightGainValue)}</span>
                    <span>Neto: {formatCurrency(item.netValue)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <RoiResult result={currentResult} />
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
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
        disabled={disabled}
      />
    </div>
  )
}
