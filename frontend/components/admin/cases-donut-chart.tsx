'use client'

import { Pie, PieChart, Cell, Label } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DashboardStats,
  type DashboardCaseStatus,
  getDashboardStatusLabel,
} from '@/lib/api/dashboard'

const STATUS_ORDER: DashboardCaseStatus[] = [
  'open',
  'in_analysis',
  'treatment',
  'waiting_client',
]

const STATUS_COLORS: Record<DashboardCaseStatus, string> = {
  open: '#F97316',
  in_analysis: '#0F766E',
  treatment: '#1D4ED8',
  waiting_client: '#A16207',
}

interface CasesDonutChartProps {
  stats: DashboardStats
}

export function CasesDonutChart({ stats }: CasesDonutChartProps) {
  const chartData = STATUS_ORDER.map((status) => ({
    status,
    label: getDashboardStatusLabel(status),
    value: stats.casesByStatus[status] ?? 0,
    fill: STATUS_COLORS[status],
  }))

  const chartConfig = Object.fromEntries(
    chartData.map((item) => [
      item.status,
      {
        label: item.label,
        color: item.fill,
      },
    ]),
  )

  return (
    <Card className="rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
      <CardHeader className="space-y-2 pb-2">
        <CardTitle className="text-xl">Estado operativo de casos</CardTitle>
        <CardDescription>
          Vista rápida del backlog activo por etapa de atención técnica.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[260px] max-w-[260px]">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-6">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-medium text-foreground">{value}</span>
                </div>
              )} />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              innerRadius={72}
              outerRadius={104}
              paddingAngle={4}
              strokeWidth={0}
            >
              {chartData.map((entry) => (
                <Cell key={entry.status} fill={entry.fill} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null

                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-[30px] font-semibold"
                      >
                        {stats.openCases}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy + 22}
                        className="fill-muted-foreground text-[12px]"
                      >
                        casos activos
                      </tspan>
                    </text>
                  )
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="space-y-3">
          {chartData.map((item) => (
            <div
              key={item.status}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/70 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: item.fill }}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">Casos en esta etapa</p>
                </div>
              </div>
              <span className="text-lg font-semibold tabular-nums text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
