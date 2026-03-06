import { createClient } from '@/lib/supabase/server'
import {
  WeightChart,
  FeedConsumptionChart,
  WaterQualityChart,
  NitrogenChart,
  MortalityChart,
  FcaChart,
  TreatmentEffectivenessChart,
} from '@/components/analytics-charts'
import { PondFilter } from '@/components/pond-filter'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ pond?: string }>
}) {
  const { pond: pondFilter } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Profile + ponds in parallel
  const [{ data: profile }, { data: orgPonds }] = await Promise.all([
    supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('ponds')
      .select('id, name')
      .order('sort_order', { ascending: true })
      .order('name'),
  ])

  const ponds = orgPonds ?? []
  let treatments: Array<{
    treatment_date: string
    pond_name: string
    product_name: string
    dose_liters: number
    ammonia_before: number | null
    ammonia_after: number | null
  }> = []
  let records: Array<{
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
  }> = []

  if (profile?.organization_id && ponds.length > 0) {
    const filteredPondIds = pondFilter ? [pondFilter] : ponds.map((p) => p.id)
    const pondNameMap: Record<string, string> = {}
    for (const p of ponds) pondNameMap[p.id] = p.name

    const [{ data: batches }, { data: rawTreatments }] = await Promise.all([
      supabase
        .from('batches')
        .select('id, pond_id')
        .in('pond_id', filteredPondIds),
      supabase
        .from('bioremediation_treatments')
        .select('pond_id, treatment_date, product_name, dose_liters, ammonia_before, ammonia_after')
        .in('pond_id', filteredPondIds)
        .order('treatment_date', { ascending: true }),
    ])

    treatments = (rawTreatments ?? []).map((t) => ({
      ...t,
      pond_name: pondNameMap[t.pond_id] ?? '',
    })) as typeof treatments

    if (batches && batches.length > 0) {
      const batchPondMap: Record<string, string> = {}
      for (const b of batches) {
        batchPondMap[b.id] = ponds.find((p) => p.id === b.pond_id)?.name ?? ''
      }

      const batchIds = batches.map((b) => b.id)
      const { data: recs } = await supabase
        .from('production_records')
        .select(
          'id, batch_id, record_date, feed_kg, avg_weight_kg, mortality_count, temperature_c, oxygen_mg_l, ammonia_mg_l, nitrite_mg_l, nitrate_mg_l, ph, calculated_fca, calculated_biomass_kg'
        )
        .in('batch_id', batchIds)
        .order('record_date', { ascending: true })
        .limit(500)

      records = (recs ?? []).map((r) => ({
        ...r,
        pond_name: batchPondMap[r.batch_id] ?? '',
      })) as typeof records
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Analitica Operativa
          </h1>
          <p className="mt-1 text-muted-foreground">Tendencias y graficas de produccion</p>
        </div>
        <PondFilter ponds={ponds} />
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-lg font-semibold text-foreground">Sin datos suficientes</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Sube reportes fotograficos en la seccion de Captura OCR para comenzar a ver graficas y
            tendencias.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <WeightChart records={records} />
          <FcaChart records={records} />
          <FeedConsumptionChart records={records} />
          <WaterQualityChart records={records} />
          <NitrogenChart records={records} />
          <TreatmentEffectivenessChart treatments={treatments} />
          <MortalityChart records={records} />
        </div>
      )}
    </div>
  )
}
