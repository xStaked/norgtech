import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { DollarSign, TrendingUp, Calculator, Scale, Info } from 'lucide-react'
import { formatCOP } from '@/lib/market-data'
import { FishPriceModal } from '@/components/fish-price-modal'
import { type BatchSummary } from '../types'

type MarketPrice = {
  species: string
  city?: string
  price_avg: number
  price_min: number
  price_max: number
  market_date?: string
  source?: string
}

interface FishTabProps {
  batches: BatchSummary[]
  marketPrices: MarketPrice[]
  totalFishRevenue: number
  totalFishCosts: number
  totalFishUtility: number
}

export function FishTab({
  batches,
  marketPrices,
  totalFishRevenue,
  totalFishCosts,
  totalFishUtility,
}: FishTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="transition-all hover:shadow-md border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ventas Proyectadas</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCOP(totalFishRevenue)}</div>
            <p className="text-xs text-muted-foreground">Basado en biomasa actual</p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md border-destructive/20 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Costos Acumulados</CardTitle>
            <Calculator className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCOP(totalFishCosts)}</div>
            <p className="text-xs text-muted-foreground">Todos los rubros</p>
          </CardContent>
        </Card>

        <Card className={`transition-all hover:shadow-md ${totalFishUtility >= 0 ? 'border-green-500/20 bg-green-500/5' : 'border-destructive/20'}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utilidad Esperada</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalFishUtility >= 0 ? 'text-green-700' : 'text-destructive'}`}>
              {formatCOP(totalFishUtility)}
            </div>
            <p className="text-xs text-muted-foreground">
              Margen: {totalFishRevenue > 0 ? ((totalFishUtility / totalFishRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card className="transition-all hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Biomasa Total</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {batches.reduce((s, b) => s + b.biomass_kg, 0).toFixed(0)} <span className="text-sm font-normal">kg</span>
            </div>
            <p className="text-xs text-muted-foreground">{batches.length} lotes activos</p>
          </CardContent>
        </Card>
      </div>

      {/* Market prices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Precios de Referencia (SIPSA - Colombia)</CardTitle>
              <CardDescription>
                Valores promedio en centrales de abastos
                {marketPrices[0]?.market_date
                  ? ` · ${new Date(marketPrices[0].market_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={`gap-1 ${marketPrices[0]?.source?.includes('referencia') ? 'border-amber-400/50 text-amber-600' : 'border-green-500/50 text-green-600'}`}
            >
              <Info className="h-3 w-3" />
              {marketPrices[0]?.source?.includes('referencia') ? 'Datos de referencia' : 'Datos en vivo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {marketPrices.map(mp => (
              <div key={`${mp.species}-${mp.city}`} className="flex flex-col gap-1 p-3 rounded-lg border bg-muted/30">
                <span className="text-xs font-semibold text-primary uppercase">{mp.species}</span>
                <span className="text-lg font-bold">{formatCOP(mp.price_avg)}/kg</span>
                <span className="text-[10px] text-muted-foreground">Rango: {formatCOP(mp.price_min)} – {formatCOP(mp.price_max)}</span>
                {mp.city && <span className="text-[10px] text-muted-foreground capitalize">{mp.city.toLowerCase()}</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Batch table */}
      <Card>
        <CardHeader>
          <CardTitle>Proyección por Lote</CardTitle>
          <CardDescription>Detalle de ingresos y costos por estanque activo</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estanque / Lote</TableHead>
                <TableHead>Biomasa</TableHead>
                <TableHead>Precio/kg</TableHead>
                <TableHead>Ingreso Proy.</TableHead>
                <TableHead>Inversión</TableHead>
                <TableHead>Utilidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No hay lotes activos para proyectar ventas.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map(b => (
                  <TableRow key={b.id} className="transition-colors hover:bg-muted/40">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{b.pond_name}</span>
                        <span className="text-xs text-muted-foreground">{b.species} · {b.population.toLocaleString()} ind.</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{b.biomass_kg.toFixed(1)} kg</span>
                        <span className="text-xs text-muted-foreground">Avg: {b.avg_weight}g</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatCOP(b.sale_price)}</TableCell>
                    <TableCell className="font-semibold">{formatCOP(b.projected_revenue)}</TableCell>
                    <TableCell className="text-destructive">{formatCOP(b.total_costs)}</TableCell>
                    <TableCell className={b.utility >= 0 ? 'text-green-600 font-bold' : 'text-destructive font-bold'}>
                      {formatCOP(b.utility)}
                    </TableCell>
                    <TableCell className="text-right">
                      <FishPriceModal batchId={b.id} currentPrice={b.sale_price} species={`${b.pond_name} - ${b.species}`} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
