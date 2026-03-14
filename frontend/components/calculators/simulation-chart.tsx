'use client'

import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { ProductionSimulationPoint } from '@/lib/api/calculators'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const chartConfig = {
  biomassKg: {
    label: 'Biomasa',
    color: '#1a3a2a',
  },
  projectedMargin: {
    label: 'Margen',
    color: '#f97316',
  },
  cumulativeFeedKg: {
    label: 'Feed acumulado',
    color: '#0f766e',
  },
} satisfies ChartConfig

export function SimulationChart({ data }: { data: ProductionSimulationPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[320px] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={82} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Legend />
        <Line type="monotone" dataKey="biomassKg" stroke="var(--color-biomassKg)" strokeWidth={3} dot={false} name="Biomasa kg" />
        <Line type="monotone" dataKey="projectedMargin" stroke="var(--color-projectedMargin)" strokeWidth={3} dot={false} name="Margen proyectado" />
        <Line type="monotone" dataKey="cumulativeFeedKg" stroke="var(--color-cumulativeFeedKg)" strokeWidth={2.5} dot={false} name="Feed acumulado" />
      </LineChart>
    </ChartContainer>
  )
}
