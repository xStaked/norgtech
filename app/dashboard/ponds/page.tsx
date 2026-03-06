import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Waves,
  AlertTriangle,
  Layers,
} from 'lucide-react'
import { PondForm } from '@/components/pond-form'
import { PondsSortableGrid } from '@/components/ponds-sortable-grid'

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
        id, name, area_m2, depth_m, species, status, created_at, sort_order,
        batches (
          id, start_date, end_date, initial_population, current_population, status,
          sale_price_per_kg, target_profitability_pct,
          fingerling_cost_per_unit, avg_weight_at_seeding_g, labor_cost_per_month
        )
      `)
      .eq('organization_id', profile.organization_id)
      .order('sort_order', { ascending: true })
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
        <PondsSortableGrid
          ponds={ponds}
          waterQuality={waterQuality}
        />
      )}
    </div>
  )
}
