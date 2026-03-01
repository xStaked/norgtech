import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Waves,
  Fish,
  Calendar,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Layers,
  FlaskConical,
  Wind,
} from 'lucide-react'
import { PondForm } from '@/components/pond-form'
import { BatchForm } from '@/components/batch-form'
import { DeletePondButton } from '@/components/pond-actions'
import { CloseBatchButton } from '@/components/pond-actions'
import { BatchFinancialConfig } from '@/components/batch-financial-config'
import { format } from 'date-fns'

export default async function PondsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  const hasOrganization = !!profile?.organization_id

  let ponds: Array<{
    id: string
    name: string
    area_m2: number | null
    depth_m: number | null
    species: string | null
    status: string
    created_at: string
    batches: Array<{
      id: string
      start_date: string
      end_date: string | null
      initial_population: number
      current_population: number | null
      status: string
      sale_price_per_kg: number | null
      target_profitability_pct: number | null
      fingerling_cost_per_unit: number | null
      avg_weight_at_seeding_g: number | null
      labor_cost_per_month: number | null
    }>
  }> = []

  let waterQuality: Record<string, {
    ammonia: number | null
    oxygen: number | null
    date: string
  }> = {}

  if (profile?.organization_id) {
    const { data } = await supabase
      .from('ponds')
      .select(`
        id, name, area_m2, depth_m, species, status, created_at,
        batches (
          id, start_date, end_date, initial_population, current_population, status,
          sale_price_per_kg, target_profitability_pct,
          fingerling_cost_per_unit, avg_weight_at_seeding_g, labor_cost_per_month
        )
      `)
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    ponds = (data as typeof ponds) ?? []

    for (const pond of ponds) {
      const activeBatches = pond.batches?.filter(b => b.status === 'active') ?? []
      if (activeBatches.length === 0) continue

      const batchIds = activeBatches.map(b => b.id)
      const { data: lastRecord } = await supabase
        .from('production_records')
        .select('ammonia_mg_l, oxygen_mg_l, record_date')
        .in('batch_id', batchIds)
        .order('record_date', { ascending: false })
        .limit(1)
        .single()

      if (lastRecord) {
        waterQuality[pond.id] = {
          ammonia: lastRecord.ammonia_mg_l != null ? Number(lastRecord.ammonia_mg_l) : null,
          oxygen: lastRecord.oxygen_mg_l != null ? Number(lastRecord.oxygen_mg_l) : null,
          date: lastRecord.record_date,
        }
      }
    }
  }

  type WaterStatus = 'critical' | 'warning' | 'normal' | null

  function getAmmoniaStatus(val: number | null): { label: string; level: WaterStatus } | null {
    if (val == null) return null
    if (val > 1.5) return { label: 'Crítico', level: 'critical' }
    if (val > 0.5) return { label: 'Alerta', level: 'warning' }
    return { label: 'Normal', level: 'normal' }
  }

  function getOxygenStatus(val: number | null): { label: string; level: WaterStatus } | null {
    if (val == null) return null
    if (val < 2) return { label: 'Crítico', level: 'critical' }
    if (val < 4) return { label: 'Bajo', level: 'warning' }
    return { label: 'Normal', level: 'normal' }
  }

  function getPondAlertLevel(pondId: string): WaterStatus {
    const wq = waterQuality[pondId]
    if (!wq) return null
    const aStatus = getAmmoniaStatus(wq.ammonia)
    const oStatus = getOxygenStatus(wq.oxygen)
    const levels: WaterStatus[] = [aStatus?.level ?? null, oStatus?.level ?? null]
    if (levels.includes('critical')) return 'critical'
    if (levels.includes('warning')) return 'warning'
    if (levels.includes('normal')) return 'normal'
    return null
  }

  const statusBorderClass: Record<NonNullable<WaterStatus>, string> = {
    critical: 'border-l-4 border-l-destructive',
    warning: 'border-l-4 border-l-amber-500',
    normal: 'border-l-4 border-l-primary',
  }

  const statusDotClass: Record<NonNullable<WaterStatus>, string> = {
    critical: 'bg-destructive',
    warning: 'bg-amber-500',
    normal: 'bg-emerald-500',
  }

  const statusBadgeClass: Record<NonNullable<WaterStatus>, string> = {
    critical: 'bg-destructive/10 text-destructive border-destructive/20',
    warning: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    normal: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  }

  // Computed stats
  const totalActiveBatches = ponds.reduce((sum, p) => {
    return sum + (p.batches?.filter(b => b.status === 'active').length ?? 0)
  }, 0)

  const criticalPonds = ponds.filter(p => getPondAlertLevel(p.id) === 'critical').length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Estanques</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestiona tus estanques y lotes productivos</p>
        </div>
        <PondForm hasOrganization={hasOrganization} />
      </div>

      {/* Summary KPIs */}
      {ponds.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Waves className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total estanques</p>
                <p className="text-2xl font-bold text-foreground">{ponds.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <Layers className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Lotes activos</p>
                <p className="text-2xl font-bold text-foreground">{totalActiveBatches}</p>
              </div>
            </CardContent>
          </Card>

          <Card className={`border-border bg-card ${criticalPonds > 0 ? 'ring-1 ring-destructive/30' : ''}`}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${criticalPonds > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                <AlertTriangle className={`h-5 w-5 ${criticalPonds > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Alertas críticas</p>
                <p className={`text-2xl font-bold ${criticalPonds > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {criticalPonds}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state */}
      {ponds.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Waves className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">No hay estanques</h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                Crea tu primer estanque para empezar a registrar lotes y datos de producción.
              </p>
            </div>
            <PondForm hasOrganization={hasOrganization} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ponds.map((pond) => {
            const activeBatches = pond.batches?.filter(b => b.status === 'active') ?? []
            const wq = waterQuality[pond.id]
            const ammoniaStatus = wq ? getAmmoniaStatus(wq.ammonia) : null
            const oxygenStatus = wq ? getOxygenStatus(wq.oxygen) : null
            const alertLevel = getPondAlertLevel(pond.id)

            return (
              <Card
                key={pond.id}
                className={[
                  'flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md',
                  alertLevel ? statusBorderClass[alertLevel] : '',
                ].join(' ')}
              >
                {/* Card Header */}
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Waves className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base font-semibold text-foreground">
                        {pond.name}
                      </CardTitle>
                      {alertLevel && (
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDotClass[alertLevel]}`} />
                          <span className="text-xs text-muted-foreground">
                            {alertLevel === 'critical' ? 'Calidad crítica' : alertLevel === 'warning' ? 'En alerta' : 'Agua óptima'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <DeletePondButton pondId={pond.id} />
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-4">
                  {/* Pond specs */}
                  <div className="flex flex-wrap gap-1.5">
                    {pond.species && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Fish className="h-3 w-3" />
                        {pond.species}
                      </Badge>
                    )}
                    {pond.area_m2 && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {pond.area_m2} m²
                      </Badge>
                    )}
                    {pond.depth_m && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {pond.depth_m} m prof.
                      </Badge>
                    )}
                  </div>

                  {/* Water quality */}
                  {wq && (wq.ammonia != null || wq.oxygen != null) && (
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Droplets className="h-3.5 w-3.5" />
                          Calidad de agua
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(wq.date), 'dd/MM/yy')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {wq.ammonia != null && ammoniaStatus && (
                          <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${statusBadgeClass[ammoniaStatus.level!]}`}>
                            <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium opacity-70">Amoniaco</p>
                              <p className="text-xs font-semibold">{wq.ammonia} mg/L</p>
                            </div>
                          </div>
                        )}
                        {wq.oxygen != null && oxygenStatus && (
                          <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${statusBadgeClass[oxygenStatus.level!]}`}>
                            <Wind className="h-3.5 w-3.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium opacity-70">Oxígeno</p>
                              <p className="text-xs font-semibold">{wq.oxygen} mg/L</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No water quality data for active batches */}
                  {activeBatches.length > 0 && !wq && (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                      <Droplets className="h-3.5 w-3.5 shrink-0" />
                      Sin datos de calidad de agua recientes
                    </div>
                  )}

                  {/* Batches section */}
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Lotes</p>
                        {activeBatches.length > 0 && (
                          <Badge className="h-4 px-1.5 text-[10px]">
                            {activeBatches.length} activo{activeBatches.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <BatchForm pondId={pond.id} />
                    </div>

                    {pond.batches && pond.batches.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {pond.batches.map((batch) => (
                          <div
                            key={batch.id}
                            className="group flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 transition-colors duration-150 hover:bg-muted/70"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {batch.status === 'active' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <span className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40" />
                                )}
                                <span className="text-xs font-medium text-foreground">
                                  {(batch.current_population ?? batch.initial_population).toLocaleString()} peces
                                </span>
                                {batch.status !== 'active' && (
                                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                                    Cerrado
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                Inicio: {format(new Date(batch.start_date), 'dd/MM/yyyy')}
                                {batch.end_date && (
                                  <span className="ml-1">
                                    · Fin: {format(new Date(batch.end_date), 'dd/MM/yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                            {batch.status === 'active' && (
                              <div className="flex shrink-0 items-center gap-1">
                                <BatchFinancialConfig
                                  batchId={batch.id}
                                  initialPopulation={batch.initial_population}
                                  current={{
                                    sale_price_per_kg: batch.sale_price_per_kg,
                                    target_profitability_pct: batch.target_profitability_pct,
                                    fingerling_cost_per_unit: batch.fingerling_cost_per_unit,
                                    avg_weight_at_seeding_g: batch.avg_weight_at_seeding_g,
                                    labor_cost_per_month: batch.labor_cost_per_month,
                                  }}
                                />
                                <CloseBatchButton batchId={batch.id} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-4 text-xs text-muted-foreground">
                        Sin lotes registrados
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
