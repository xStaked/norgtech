import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  WeightChart,
  FeedConsumptionChart,
  WaterQualityChart,
  NitrogenChart,
  MortalityChart,
  FcaChart,
  TreatmentEffectivenessChart,
} from '@/components/analytics-charts'
import { requireAdminUser } from '@/lib/auth/roles'
import { Activity, AlertTriangle, BarChart3, FlaskConical } from 'lucide-react'
import { CsvExportButton } from '@/components/admin/csv-export-button'

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; days?: string }>
}) {
  const { org, days } = await searchParams
  const selectedOrg = org && org !== 'all' ? org : null
  const daysWindow = ['30', '90', '180', '365'].includes(days || '') ? Number(days) : 90

  const { supabase } = await requireAdminUser()

  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name')
    .order('name')

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - daysWindow)
  const fromDateStr = fromDate.toISOString().slice(0, 10)

  const pondsQuery = supabase.from('ponds').select('id, name, organization_id').order('name')
  if (selectedOrg) pondsQuery.eq('organization_id', selectedOrg)
  const { data: pondsData } = await pondsQuery
  const ponds = pondsData ?? []

  const pondIds = ponds.map((pond) => pond.id)

  let recordsForCharts: Array<{
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
    organization_id: string | null
  }> = []

  let treatments: Array<{
    treatment_date: string
    pond_name: string
    product_name: string
    dose_liters: number
    ammonia_before: number | null
    ammonia_after: number | null
  }> = []

  let alerts: Array<{ severity: string; alert_type: string; created_at: string }> = []

  if (pondIds.length > 0) {
    const [batchesResult, recordsResult, treatmentsResult, alertsResult] = await Promise.all([
      supabase.from('batches').select('id, pond_id').in('pond_id', pondIds),
      supabase
        .from('production_records')
        .select(
          'id, batch_id, record_date, feed_kg, avg_weight_kg, mortality_count, temperature_c, oxygen_mg_l, ammonia_mg_l, nitrite_mg_l, nitrate_mg_l, ph, calculated_fca, calculated_biomass_kg'
        )
        .gte('record_date', fromDateStr)
        .order('record_date', { ascending: true })
        .limit(3000),
      supabase
        .from('bioremediation_treatments')
        .select('pond_id, treatment_date, product_name, dose_liters, ammonia_before, ammonia_after')
        .in('pond_id', pondIds)
        .gte('treatment_date', fromDateStr)
        .order('treatment_date', { ascending: true }),
      supabase
        .from('alerts')
        .select('severity, alert_type, created_at')
        .in('pond_id', pondIds)
        .gte('created_at', `${fromDateStr}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(1000),
    ])

    const pondMap = new Map(ponds.map((pond) => [pond.id, pond]))

    if (!batchesResult.error) {
      const batches = batchesResult.data ?? []
      const batchPondMap = new Map(batches.map((batch) => [batch.id, batch.pond_id]))

      if (!recordsResult.error) {
        recordsForCharts = (recordsResult.data ?? []).map((record) => {
          const pondId = batchPondMap.get(record.batch_id)
          const pond = pondId ? pondMap.get(pondId) : undefined
          return {
            ...record,
            pond_name: pond?.name || '-',
            organization_id: pond?.organization_id || null,
          }
        }) as typeof recordsForCharts
      }
    }

    if (!treatmentsResult.error) {
      treatments = (treatmentsResult.data ?? []).map((treatment) => ({
        ...treatment,
        pond_name: pondMap.get(treatment.pond_id)?.name || '-',
      })) as typeof treatments
    }

    if (!alertsResult.error) {
      alerts = alertsResult.data ?? []
    }
  }

  const recordsForChartsWithoutOrg = recordsForCharts.map(({ organization_id, ...record }) => record)

  const validFca = recordsForCharts
    .map((record) => record.calculated_fca)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const avgFca = validFca.length > 0 ? validFca.reduce((a, b) => a + b, 0) / validFca.length : null

  const mortalityTotal = recordsForCharts.reduce((acc, record) => acc + (record.mortality_count ?? 0), 0)
  const lowOxygenCount = recordsForCharts.filter((record) => (record.oxygen_mg_l ?? 99) < 4).length
  const highAmmoniaCount = recordsForCharts.filter((record) => (record.ammonia_mg_l ?? 0) > 0.5).length

  const recordsByOrg = recordsForCharts.reduce<Record<string, number>>((acc, record) => {
    const key = record.organization_id ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const orgRanking = Object.entries(recordsByOrg)
    .map(([orgId, totalRecords]) => ({
      orgId,
      totalRecords,
      name: organizations?.find((organization) => organization.id === orgId)?.name || 'Sin organizacion',
    }))
    .sort((a, b) => b.totalRecords - a.totalRecords)
    .slice(0, 8)

  const criticalAlerts = alerts.filter((alert) => alert.severity === 'critical').length
  const analyticsExportRows = recordsForCharts.map((row) => ({
    fecha: row.record_date,
    estanque: row.pond_name,
    alimento_kg: row.feed_kg ?? '',
    peso_kg: row.avg_weight_kg ?? '',
    mortalidad: row.mortality_count ?? 0,
    temperatura_c: row.temperature_c ?? '',
    oxigeno_mg_l: row.oxygen_mg_l ?? '',
    amonia_mg_l: row.ammonia_mg_l ?? '',
    nitrito_mg_l: row.nitrite_mg_l ?? '',
    nitrato_mg_l: row.nitrate_mg_l ?? '',
    ph: row.ph ?? '',
    fca: row.calculated_fca ?? '',
    biomasa_kg: row.calculated_biomass_kg ?? '',
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Analiticas Administrativas</h2>
          <p className="mt-1 text-muted-foreground">Analisis global de calidad de agua, produccion y alertas</p>
        </div>

        <form className="flex flex-wrap items-center gap-2" method="GET">
          <select
            id="org"
            name="org"
            defaultValue={selectedOrg ?? 'all'}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todas las granjas</option>
            {organizations?.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <select
            id="days"
            name="days"
            defaultValue={String(daysWindow)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="30">Ultimos 30 dias</option>
            <option value="90">Ultimos 90 dias</option>
            <option value="180">Ultimos 180 dias</option>
            <option value="365">Ultimo ano</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Aplicar
          </button>
          <CsvExportButton
            rows={analyticsExportRows}
            filename={`admin_analiticas_${new Date().toISOString().slice(0, 10)}.csv`}
            label="Exportar CSV"
          />
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Registros analizados</CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{recordsForCharts.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">FCA promedio</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{avgFca != null ? avgFca.toFixed(2) : '-'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Eventos NH3 alto</CardTitle>
            <AlertTriangle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{highAmmoniaCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tratamientos</CardTitle>
            <FlaskConical className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{treatments.length}</p>
          </CardContent>
        </Card>
      </div>

      {recordsForChartsWithoutOrg.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay suficientes datos en el periodo seleccionado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <WeightChart records={recordsForChartsWithoutOrg} />
          <FcaChart records={recordsForChartsWithoutOrg} />
          <FeedConsumptionChart records={recordsForChartsWithoutOrg} />
          <WaterQualityChart records={recordsForChartsWithoutOrg} />
          <NitrogenChart records={recordsForChartsWithoutOrg} />
          <TreatmentEffectivenessChart treatments={treatments} />
          <MortalityChart records={recordsForChartsWithoutOrg} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Granjas con mayor actividad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Granja</th>
                    <th className="py-2 pr-0 text-right font-medium text-muted-foreground">Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {orgRanking.map((row) => (
                    <tr key={row.orgId} className="border-b border-border/70">
                      <td className="py-2 pr-3 text-foreground">{row.name}</td>
                      <td className="py-2 pr-0 text-right text-muted-foreground">{row.totalRecords}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Indicadores de riesgo del periodo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Mortalidad acumulada</p>
              <p className="text-2xl font-semibold text-foreground">{mortalityTotal}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Lecturas de oxigeno bajo (O2 &lt; 4 mg/L)</p>
              <p className="text-2xl font-semibold text-foreground">{lowOxygenCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Alertas criticas registradas</p>
              <p className="text-2xl font-semibold text-foreground">{criticalAlerts}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
