import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DollarSign, TrendingUp, Droplets, FlaskConical, ArrowDownRight, Fish, Scale, Calculator, Info } from 'lucide-react'
import { formatCOP, getColombianMarketPrices } from '@/lib/market-data'
import { FishPriceModal } from '@/components/fish-price-modal'

// Precio de referencia por litro de producto (configurable)
const PRICE_PER_LITER = 52500 // Ajustado a COP aproximado para bioremediacion

export default async function CostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  let treatments: Array<{
    id: string
    pond_name: string
    treatment_date: string
    product_name: string
    dose_liters: number
    ammonia_before: number | null
    ammonia_after: number | null
    notes: string | null
    revenue: number
    effectiveness: number | null
  }> = []

  let fishSales: Array<{
    id: string
    pond_name: string
    species: string
    population: number
    avg_weight: number
    biomass_kg: number
    sale_price: number
    projected_revenue: number
    total_costs: number
    utility: number
    status: string
  }> = []

  const marketPrices = await getColombianMarketPrices()

  if (profile?.organization_id) {
    // 1. Fetch Bioremediation Treatments
    const [{ data: ponds }, { data: rawTreatments }, { data: rawBatches }] = await Promise.all([
      supabase
        .from('ponds')
        .select('id, name, species')
        .eq('organization_id', profile.organization_id),
      supabase
        .from('bioremediation_treatments')
        .select('id, pond_id, treatment_date, product_name, dose_liters, ammonia_before, ammonia_after, notes')
        .eq('user_id', user!.id)
        .order('treatment_date', { ascending: false }),
      supabase
        .from('batches')
        .select(`
          id, 
          pond_id, 
          status, 
          current_population, 
          sale_price_per_kg,
          production_records (
            avg_weight_g,
            feed_cost,
            other_cost,
            record_date
          )
        `)
        .eq('status', 'active')
    ])

    const pondMap: Record<string, { name: string; species: string }> = {}
    for (const p of ponds ?? []) pondMap[p.id] = { name: p.name, species: p.species || 'Pescado' }

    treatments = (rawTreatments ?? []).map((t) => {
      const dose = Number(t.dose_liters) || 0
      const before = t.ammonia_before != null ? Number(t.ammonia_before) : null
      const after = t.ammonia_after != null ? Number(t.ammonia_after) : null
      let effectiveness: number | null = null
      if (before != null && after != null && before > 0) {
        effectiveness = ((before - after) / before) * 100
      }
      return {
        id: t.id,
        pond_name: pondMap[t.pond_id]?.name ?? 'Sin estanque',
        treatment_date: t.treatment_date,
        product_name: t.product_name,
        dose_liters: dose,
        ammonia_before: before,
        ammonia_after: after,
        notes: t.notes,
        revenue: dose * PRICE_PER_LITER,
        effectiveness,
      }
    })

    // 2. Process Fish Sales Projections
    fishSales = (rawBatches ?? []).map((b: any) => {
      const records = b.production_records || []
      // Último peso registrado
      const latestRecord = [...records].sort((x, y) =>
        new Date(y.record_date).getTime() - new Date(x.record_date).getTime()
      )[0]

      const avgWeight = latestRecord?.avg_weight_g || 0
      const population = b.current_population || 0
      const biomassKg = (population * avgWeight) / 1000

      // Si no hay precio definido, buscar el promedio de mercado para la especie
      const pondInfo = pondMap[b.pond_id]
      const marketRef = marketPrices.find(mp =>
        pondInfo?.species.toLowerCase().includes(mp.species.toLowerCase().split(' ')[0])
      )

      const salePrice = b.sale_price_per_kg || marketRef?.price_avg || 9000

      const projectedRevenue = biomassKg * salePrice
      const totalCosts = records.reduce((sum: number, r: any) => sum + (Number(r.feed_cost) || 0) + (Number(r.other_cost) || 0), 0)

      return {
        id: b.id,
        pond_name: pondInfo?.name ?? 'S/E',
        species: pondInfo?.species ?? 'Pescado',
        population,
        avg_weight: avgWeight,
        biomass_kg: biomassKg,
        sale_price: salePrice,
        projected_revenue: projectedRevenue,
        total_costs: totalCosts,
        utility: projectedRevenue - totalCosts,
        status: b.status
      }
    })
  }

  const totalBioRevenue = treatments.reduce((s, t) => s + t.revenue, 0)
  const totalFishRevenue = fishSales.reduce((s, b) => s + b.projected_revenue, 0)
  const totalFishCosts = fishSales.reduce((s, b) => s + b.total_costs, 0)
  const totalFishUtility = totalFishRevenue - totalFishCosts

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestión de Ventas y Utilidades</h1>
          <p className="mt-1 text-muted-foreground">Monitoreo de ingresos proyectados y efectividad operativa en Colombia</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-1.5 border border-primary/20">
          <span className="text-xs font-semibold uppercase text-primary">Moneda: COP</span>
        </div>
      </div>

      <Tabs defaultValue="fish" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="fish" className="gap-2">
            <Fish className="h-4 w-4" />
            Ventas de Pescado
          </TabsTrigger>
          <TabsTrigger value="bio" className="gap-2">
            <FlaskConical className="h-4 w-4" />
            Bioremediación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fish" className="mt-6 flex flex-col gap-6">
          {/* Fish KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="transition-all hover:shadow-md border-primary/20 bg-primary/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ventas Proyectadas</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCOP(totalFishRevenue)}</div>
                <p className="text-xs text-muted-foreground">Basado en biomasa actual</p>
              </CardContent>
            </Card>
            <Card className="transition-all hover:shadow-md border-destructive/20 bg-destructive/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Costos Acumulados</CardTitle>
                <Calculator className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCOP(totalFishCosts)}</div>
                <p className="text-xs text-muted-foreground">Alimento y otros rubros</p>
              </CardContent>
            </Card>
            <Card className="transition-all hover:shadow-md border-green-500/20 bg-green-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Utilidad Esperada</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">{formatCOP(totalFishUtility)}</div>
                <p className="text-xs text-muted-foreground">Margen: {totalFishRevenue > 0 ? ((totalFishUtility / totalFishRevenue) * 100).toFixed(1) : 0}%</p>
              </CardContent>
            </Card>
            <Card className="transition-all hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Biomasa Total</CardTitle>
                <Scale className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{fishSales.reduce((s, b) => s + b.biomass_kg, 0).toFixed(0)} <span className="text-sm font-normal">kg</span></div>
                <p className="text-xs text-muted-foreground">{fishSales.length} lotes activos</p>
              </CardContent>
            </Card>
          </div>

          {/* Market References */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Precios de Referencia (SIPSA - Colombia)</CardTitle>
                  <CardDescription>Valores promedio en centrales de abastos hoy</CardDescription>
                </div>
                <Badge variant="outline" className="gap-1">
                  <Info className="h-3 w-3" />
                  Datos de Mercado
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {marketPrices.map((mp) => (
                  <div key={mp.species} className="flex flex-col gap-1 p-3 rounded-lg border bg-muted/30">
                    <span className="text-xs font-semibold text-primary uppercase">{mp.species}</span>
                    <span className="text-lg font-bold">{formatCOP(mp.price_avg)}</span>
                    <span className="text-[10px] text-muted-foreground">Rango: {formatCOP(mp.price_min)} - {formatCOP(mp.price_max)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Batches Table */}
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
                    <TableHead>Biomasa (kg)</TableHead>
                    <TableHead>Precio/kg</TableHead>
                    <TableHead>Ingreso Proyectado</TableHead>
                    <TableHead>Costo Total</TableHead>
                    <TableHead>Utilidad</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fishSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No hay lotes activos para proyectar ventas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    fishSales.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{b.pond_name}</span>
                            <span className="text-xs text-muted-foreground">{b.species} • {b.population.toLocaleString()} ind.</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{b.biomass_kg.toFixed(1)} kg</span>
                            <span className="text-xs text-muted-foreground">Avg: {b.avg_weight}g</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{formatCOP(b.sale_price)}</span>
                          </div>
                        </TableCell>
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
        </TabsContent>

        <TabsContent value="bio" className="mt-6 flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos Bioremediación</CardTitle>
                <DollarSign className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCOP(totalBioRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Producto Vendido</CardTitle>
                <Droplets className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {treatments.reduce((s, t) => s + t.dose_liters, 0).toFixed(1)} <span className="text-sm font-normal">L</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Efectividad Promedio</CardTitle>
                <FlaskConical className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {(() => {
                    const valid = treatments.filter((t) => t.effectiveness != null)
                    if (valid.length === 0) return '—'
                    return `${(valid.reduce((s, t) => s + t.effectiveness!, 0) / valid.length).toFixed(0)}%`
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Historial de Tratamientos</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estanque</TableHead>
                    <TableHead>Dosis (L)</TableHead>
                    <TableHead>Ingreso</TableHead>
                    <TableHead>Efectividad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treatments.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.treatment_date + 'T12:00:00').toLocaleDateString('es-CO')}</TableCell>
                      <TableCell className="font-medium">{t.pond_name}</TableCell>
                      <TableCell>{t.dose_liters.toFixed(1)}</TableCell>
                      <TableCell className="font-medium text-primary">{formatCOP(t.revenue)}</TableCell>
                      <TableCell>
                        {t.effectiveness != null ? (
                          <Badge variant="outline" className={t.effectiveness >= 60 ? 'border-primary/30 text-primary' : 'border-amber-500/30 text-amber-600'}>
                            {t.effectiveness.toFixed(0)}%
                          </Badge>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
