import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DollarSign, TrendingUp, TrendingDown, Calculator, Target,
  AlertTriangle, CheckCircle2, Flame,
} from 'lucide-react'
import { formatCOP } from '@/lib/market-data'
import { FishPriceModal } from '@/components/fish-price-modal'
import { type BatchSummary, profitabilityBadge } from '../types'

interface InvestmentTabProps {
  batches: BatchSummary[]
  totalFishRevenue: number
  totalFishCosts: number
  totalFishUtility: number
  overallProfitability: number
  totalFeedCostAll: number
  totalLaborCostAll: number
  totalFingerlingCostAll: number
}

export function InvestmentTab({
  batches,
  totalFishRevenue,
  totalFishCosts,
  totalFishUtility,
  overallProfitability,
  totalFeedCostAll,
  totalLaborCostAll,
  totalFingerlingCostAll,
}: InvestmentTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Global KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="transition-all hover:shadow-md border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos Proyectados</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCOP(totalFishRevenue)}</div>
            <p className="text-xs text-muted-foreground">{batches.length} lotes activos</p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md border-destructive/20 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inversión Total</CardTitle>
            <Flame className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCOP(totalFishCosts)}</div>
            <p className="text-xs text-muted-foreground">
              {totalFishRevenue > 0 ? ((totalFishCosts / totalFishRevenue) * 100).toFixed(1) : 0}% del ingreso proyectado
            </p>
          </CardContent>
        </Card>

        <Card className={`transition-all hover:shadow-md ${totalFishUtility >= 0 ? 'border-green-500/20 bg-green-500/5' : 'border-destructive/20 bg-destructive/5'}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utilidad Esperada</CardTitle>
            {totalFishUtility >= 0
              ? <TrendingUp className="h-4 w-4 text-green-600" />
              : <TrendingDown className="h-4 w-4 text-destructive" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalFishUtility >= 0 ? 'text-green-700' : 'text-destructive'}`}>
              {formatCOP(totalFishUtility)}
            </div>
            <p className="text-xs text-muted-foreground">Margen: {overallProfitability.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Desglose de costos</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Alimento</span>
              <span className="font-medium">{formatCOP(totalFeedCostAll)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Mano de obra</span>
              <span className="font-medium">{formatCOP(totalLaborCostAll)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Alevinos</span>
              <span className="font-medium">{formatCOP(totalFingerlingCostAll)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Bioremediación</span>
              <span className="font-medium">{formatCOP(batches.reduce((s, b) => s + b.total_bio_cost, 0))}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-batch investment cards */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Seguimiento por lote</h2>
        {batches.length === 0 ? (
          <Card>
            <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
              No hay lotes activos. Crea un lote desde Estanques para empezar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {batches.map(b => {
              const investmentPct = b.projected_revenue > 0
                ? Math.min((b.total_costs / b.projected_revenue) * 100, 100)
                : 0
              const maxInvestmentPct = 100 - b.target_pct
              const isOverBudget = b.total_costs > b.projected_revenue * (1 - b.target_pct / 100)
              const statusIcon = b.profitability_pct >= b.target_pct
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : isOverBudget
                  ? <AlertTriangle className="h-5 w-5 text-destructive" />
                  : <Target className="h-5 w-5 text-amber-500" />

              return (
                <Card key={b.id} className="transition-all hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{b.pond_name}</CardTitle>
                        <CardDescription>{b.species} · {b.population.toLocaleString()} ind. · {b.days_active}d activo</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${profitabilityBadge(b.profitability_pct, b.target_pct)}`}
                        >
                          {b.profitability_pct.toFixed(1)}% utilidad
                        </Badge>
                        {statusIcon}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {/* Investment progress bar */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Inversión quemada</span>
                        <span className="font-medium">
                          {investmentPct.toFixed(1)}% / máx {maxInvestmentPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="absolute top-0 h-full w-0.5 bg-amber-400 z-10"
                          style={{ left: `${maxInvestmentPct}%` }}
                        />
                        <div
                          className={`h-full rounded-full transition-all ${
                            isOverBudget ? 'bg-destructive' : investmentPct > maxInvestmentPct * 0.8 ? 'bg-amber-500' : 'bg-primary'
                          }`}
                          style={{ width: `${investmentPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{formatCOP(b.total_costs)} invertido</span>
                        <span className={isOverBudget ? 'text-destructive font-medium' : 'text-green-600 font-medium'}>
                          {isOverBudget
                            ? `${formatCOP(Math.abs(b.remaining_budget))} sobre presupuesto`
                            : `${formatCOP(b.remaining_budget)} disponibles`}
                        </span>
                      </div>
                    </div>

                    {/* Key numbers grid */}
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded border bg-muted/30 p-2">
                        <div className="font-bold text-primary">{formatCOP(b.projected_revenue)}</div>
                        <div className="text-[10px] text-muted-foreground">Ingreso proyect.</div>
                      </div>
                      <div className="rounded border bg-muted/30 p-2">
                        <div className="font-bold text-destructive">{formatCOP(b.total_costs)}</div>
                        <div className="text-[10px] text-muted-foreground">Inversión actual</div>
                      </div>
                      <div className="rounded border bg-muted/30 p-2">
                        <div className={`font-bold ${b.utility >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {formatCOP(b.utility)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Utilidad esperada</div>
                      </div>
                    </div>

                    {/* Target insight */}
                    <div className={`rounded-lg p-2.5 text-xs ${isOverBudget ? 'bg-destructive/10 border border-destructive/20' : 'bg-amber-50 border border-amber-200'}`}>
                      <span className="font-medium">
                        {isOverBudget
                          ? `⚠ Superaste el presupuesto para ${b.target_pct}% de utilidad. Ajusta el precio de venta o reduce costos.`
                          : `Con objetivo de ${b.target_pct}% de utilidad, puedes invertir ${formatCOP(b.remaining_budget)} más antes de alcanzar el límite.`}
                      </span>
                    </div>

                    {/* Cost breakdown */}
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Alimento</span><span>{formatCOP(b.total_feed_cost)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Mano de obra</span><span>{formatCOP(b.total_labor_cost)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Alevinos</span><span>{formatCOP(b.total_fingerling_cost)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Bioremediación</span><span>{formatCOP(b.total_bio_cost)}</span></div>
                    </div>

                    <div className="flex justify-end">
                      <FishPriceModal batchId={b.id} currentPrice={b.sale_price} species={`${b.pond_name} - ${b.species}`} />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
