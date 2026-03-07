'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface ProductionRecord {
  id: string
  record_date: string
  feed_kg: number | null
  avg_weight_kg: number | null
  mortality_count: number
  temperature_c: number | null
  oxygen_mg_l: number | null
  ammonia_mg_l: number | null
  nitrite_mg_l: number | null
  nitrate_mg_l: number | null
  ph: number | null
  calculated_fca: number | null
  calculated_biomass_kg: number | null
  pond_name: string
}

const MAX_POINTS = 90

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/**
 * Downsample records by averaging values within each bucket.
 * Keeps at most MAX_POINTS data points for chart performance.
 */
function downsample<T extends { date: string }>(
  data: T[],
  numericKeys: (keyof T)[]
): T[] {
  if (data.length <= MAX_POINTS) return data

  const bucketSize = Math.ceil(data.length / MAX_POINTS)
  const result: T[] = []

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize)
    const averaged = { ...bucket[Math.floor(bucket.length / 2)] }

    for (const key of numericKeys) {
      const vals = bucket
        .map((d) => d[key])
        .filter((v) => v !== null && v !== undefined) as number[]
      if (vals.length > 0) {
        ;(averaged as Record<string, unknown>)[key as string] =
          Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
      }
    }

    result.push(averaged)
  }

  return result
}

export function WeightChart({ records, targetWeight }: { records: ProductionRecord[]; targetWeight?: number }) {
  const data = useMemo(() => {
    const raw = records
      .filter((r) => r.avg_weight_kg !== null)
      .sort((a, b) => a.record_date.localeCompare(b.record_date))
      .map((r) => ({
        date: formatDate(r.record_date),
        peso: r.avg_weight_kg! * 1000,
      }))
    return downsample(raw, ['peso'])
  }, [records])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Peso Promedio (g)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin datos de peso aun</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="peso"
                name="Peso real"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {targetWeight && (
                <ReferenceLine
                  y={targetWeight}
                  stroke="hsl(var(--chart-3))"
                  strokeDasharray="5 5"
                  label={{ value: 'Objetivo', position: 'right', fill: 'hsl(var(--chart-3))' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function FeedConsumptionChart({ records }: { records: ProductionRecord[] }) {
  const data = useMemo(() => {
    const raw = records
      .filter((r) => r.feed_kg !== null)
      .sort((a, b) => a.record_date.localeCompare(b.record_date))
      .map((r) => ({
        date: formatDate(r.record_date),
        alimento: r.feed_kg as number,
      }))
    return downsample(raw, ['alimento'])
  }, [records])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Consumo de Alimento (kg)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin datos de alimento aun</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar
                dataKey="alimento"
                name="Alimento (kg)"
                fill="hsl(var(--chart-2))"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function WaterQualityChart({ records }: { records: ProductionRecord[] }) {
  const data = useMemo(() => {
    const raw = records
      .filter((r) => r.temperature_c !== null || r.oxygen_mg_l !== null)
      .sort((a, b) => a.record_date.localeCompare(b.record_date))
      .map((r) => ({
        date: formatDate(r.record_date),
        temperatura: r.temperature_c as number,
        oxigeno: r.oxygen_mg_l as number,
      }))
    return downsample(raw, ['temperatura', 'oxigeno'])
  }, [records])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Temperatura y Oxigeno</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin datos ambientales aun</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis yAxisId="temp" className="text-xs" />
              <YAxis yAxisId="oxy" orientation="right" className="text-xs" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temperatura"
                name="Temp (C)"
                stroke="hsl(var(--chart-3))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="oxy"
                type="monotone"
                dataKey="oxigeno"
                name="O2 (mg/L)"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceLine
                yAxisId="oxy"
                y={4}
                stroke="hsl(var(--chart-5))"
                strokeDasharray="5 5"
                label={{ value: 'Min O2', position: 'left', fill: 'hsl(var(--chart-5))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function NitrogenChart({ records }: { records: ProductionRecord[] }) {
  const data = useMemo(() => {
    const raw = records
      .filter((r) => r.ammonia_mg_l !== null || r.nitrite_mg_l !== null || r.nitrate_mg_l !== null)
      .sort((a, b) => a.record_date.localeCompare(b.record_date))
      .map((r) => ({
        date: formatDate(r.record_date),
        amonio: r.ammonia_mg_l as number,
        nitritos: r.nitrite_mg_l as number,
        nitratos: r.nitrate_mg_l as number,
        ph: r.ph as number,
      }))
    return downsample(raw, ['amonio', 'nitritos', 'nitratos', 'ph'])
  }, [records])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Compuestos Nitrogenados y pH</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin datos de nitrogeno aun</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="amonio" name="NH3 (mg/L)" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="nitritos" name="NO2 (mg/L)" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="nitratos" name="NO3 (mg/L)" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceLine y={0.5} stroke="hsl(var(--chart-5))" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function MortalityChart({ records }: { records: ProductionRecord[] }) {
  const data = useMemo(() => {
    const sorted = [...records].sort((a, b) => a.record_date.localeCompare(b.record_date))
    let cumulative = 0
    const raw = sorted.map((r) => {
      cumulative += r.mortality_count ?? 0
      return {
        date: formatDate(r.record_date),
        diaria: r.mortality_count,
        acumulada: cumulative,
      }
    })
    return downsample(raw, ['diaria', 'acumulada'])
  }, [records])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Mortalidad</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin datos de mortalidad aun</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              <Bar dataKey="diaria" name="Diaria" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line type="monotone" dataKey="acumulada" name="Acumulada" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

interface Treatment {
  treatment_date: string
  pond_name: string
  product_name: string
  dose_liters: number
  ammonia_before: number | null
  ammonia_after: number | null
}

export function TreatmentEffectivenessChart({ treatments }: { treatments: Treatment[] }) {
  const data = useMemo(() => {
    return treatments
      .filter((t) => t.ammonia_before != null && t.ammonia_after != null)
      .sort((a, b) => a.treatment_date.localeCompare(b.treatment_date))
      .map((t) => {
        const reduction = t.ammonia_before! > 0
          ? Math.round(((t.ammonia_before! - t.ammonia_after!) / t.ammonia_before!) * 100)
          : 0
        return {
          date: formatDate(t.treatment_date),
          antes: t.ammonia_before,
          despues: t.ammonia_after,
          efectividad: reduction,
          estanque: t.pond_name,
        }
      })
  }, [treatments])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Efectividad de Tratamientos (NH3)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin tratamientos con mediciones antes/despues</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis yAxisId="nh3" className="text-xs" label={{ value: 'mg/L', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
              <YAxis yAxisId="pct" orientation="right" className="text-xs" domain={[0, 100]} label={{ value: '%', angle: 90, position: 'insideRight', style: { fontSize: 11 } }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="nh3" dataKey="antes" name="NH3 Antes" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar yAxisId="nh3" dataKey="despues" name="NH3 Despues" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="pct" type="monotone" dataKey="efectividad" name="Efectividad %" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function FcaChart({ records }: { records: ProductionRecord[] }) {
  const data = useMemo(() => {
    const raw = records
      .filter((r) => r.calculated_fca !== null)
      .sort((a, b) => a.record_date.localeCompare(b.record_date))
      .map((r) => ({
        date: formatDate(r.record_date),
        fca: Number(r.calculated_fca?.toFixed(2)),
      }))
    return downsample(raw, ['fca'])
  }, [records])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">Factor de Conversion Alimenticia (FCA)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Se necesitan al menos 2 registros de peso para calcular FCA</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" domain={[0, 'auto']} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="fca"
                name="FCA"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceLine
                y={1.8}
                stroke="hsl(var(--chart-4))"
                strokeDasharray="5 5"
                label={{ value: 'Objetivo 1.8', position: 'right', fill: 'hsl(var(--chart-4))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
