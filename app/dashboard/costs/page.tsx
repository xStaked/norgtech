import { createClient } from '@/lib/supabase/server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DollarSign, FlaskConical, Fish, Scale, Target, Wheat } from 'lucide-react'
import { getColombianMarketPrices } from '@/lib/market-data'
import { SyncMarketPricesButton } from '@/components/sync-market-prices-button'
import { InvestmentTab } from './_tabs/investment-tab'
import { HarvestTab } from './_tabs/harvest-tab'
import { FeedTab } from './_tabs/feed-tab'
import { FishTab } from './_tabs/fish-tab'
import { BioTab } from './_tabs/bio-tab'
import {
  PRICE_PER_LITER,
  type Treatment,
  type BatchSummary,
  type Concentrate,
  type FeedRecord,
  type HarvestRecord,
} from './types'

export default async function CostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  const marketPrices = await getColombianMarketPrices('BOGOTÁ')

  let treatments: Treatment[] = []
  let batches: BatchSummary[] = []
  let concentrates: Concentrate[] = []
  let feedRecords: FeedRecord[] = []
  let harvests: HarvestRecord[] = []

  if (profile?.organization_id) {
    const [
      { data: ponds },
      { data: rawTreatments },
      { data: rawBatches },
      { data: rawConcentrates },
      { data: rawFeedRecords },
      { data: rawHarvests },
    ] = await Promise.all([
      supabase
        .from('ponds')
        .select('id, name, species')
        .eq('organization_id', profile.organization_id)
        .order('sort_order', { ascending: true })
        .order('name'),
      supabase
        .from('bioremediation_treatments')
        .select('id, pond_id, treatment_date, product_name, dose_liters, ammonia_before, ammonia_after, notes')
        .eq('user_id', user!.id)
        .order('treatment_date', { ascending: false }),
      supabase
        .from('batches')
        .select(`
          id, pond_id, status, start_date,
          initial_population, current_population,
          avg_weight_at_seeding_g, fingerling_cost_per_unit,
          sale_price_per_kg, target_profitability_pct,
          labor_cost_per_month,
          production_records (avg_weight_kg, record_date),
          monthly_feed_records (kg_used, cost_per_kg)
        `)
        .eq('status', 'active'),
      supabase
        .from('feed_concentrates')
        .select('id, name, brand, price_per_kg, protein_pct, is_active')
        .eq('organization_id', profile.organization_id)
        .order('name'),
      supabase
        .from('monthly_feed_records')
        .select('id, batch_id, concentrate_id, concentrate_name, production_stage, year, month, kg_used, cost_per_kg')
        .order('year', { ascending: false })
        .order('month', { ascending: false }),
      supabase
        .from('harvest_records')
        .select('id, batch_id, harvest_date, total_animals, avg_weight_whole_g, avg_weight_eviscerated_g, labor_cost, notes')
        .order('harvest_date', { ascending: false }),
    ])

    const pondMap: Record<string, { name: string; species: string }> = {}
    const pondOrderMap: Record<string, number> = {}
    for (const [index, p] of (ponds ?? []).entries()) {
      pondMap[p.id] = { name: p.name, species: p.species || 'Pescado' }
      pondOrderMap[p.id] = index
    }
    const sortedRawBatches = [...(rawBatches ?? [])].sort((a: any, b: any) => {
      const aExists = pondOrderMap[a.pond_id] != null
      const bExists = pondOrderMap[b.pond_id] != null
      if (!aExists && !bExists) return 0
      if (!aExists) return 1
      if (!bExists) return -1
      const aOrder = pondOrderMap[a.pond_id] ?? Number.MAX_SAFE_INTEGER
      const bOrder = pondOrderMap[b.pond_id] ?? Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    })
    const orgRawBatches = sortedRawBatches.filter((b: any) => pondOrderMap[b.pond_id] != null)
    const orgBatchIds = new Set(orgRawBatches.map((b: any) => b.id))

    // ── bioremediation ──────────────────────────────────────────
    treatments = (rawTreatments ?? []).map(t => {
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

    // ── batches investment summary ──────────────────────────────
    batches = orgRawBatches.map((b: any) => {
      const pondInfo = pondMap[b.pond_id]
      const records: any[] = b.production_records || []
      const feedRecs: any[] = b.monthly_feed_records || []

      const latestRecord = [...records].sort((x, y) =>
        new Date(y.record_date).getTime() - new Date(x.record_date).getTime()
      )[0]
      const avgWeightKg = latestRecord?.avg_weight_kg || 0
      const population = b.current_population || 0
      // biomasa (kg) = nº peces × avg_weight_kg (ya está en kg)
      const biomassKg = population * avgWeightKg

      const marketRef = marketPrices.find(mp =>
        pondInfo?.species.toLowerCase().includes(mp.species.toLowerCase().split(' ')[0])
      )
      const salePrice = b.sale_price_per_kg || marketRef?.price_avg || 9000
      const projectedRevenue = biomassKg * salePrice

      const totalFeedCost = feedRecs.reduce((s: number, r: any) =>
        s + (Number(r.kg_used) || 0) * (Number(r.cost_per_kg) || 0), 0)

      const startDate = new Date(b.start_date)
      const daysActive = Math.floor((Date.now() - startDate.getTime()) / 86_400_000)
      const monthsActive = daysActive / 30

      const fingerlingCostTotal = (b.fingerling_cost_per_unit || 0) * (b.initial_population || 0)
      const laborCostTotal = (b.labor_cost_per_month || 0) * Math.max(monthsActive, 1)
      const bioCostTotal = treatments
        .filter(t => ponds?.find(p => p.name === t.pond_name)?.id === b.pond_id)
        .reduce((s, t) => s + t.dose_liters * PRICE_PER_LITER, 0)

      const totalCosts = totalFeedCost + fingerlingCostTotal + laborCostTotal + bioCostTotal
      const utility = projectedRevenue - totalCosts
      const profitabilityPct = projectedRevenue > 0 ? (utility / projectedRevenue) * 100 : 0
      const targetPct = b.target_profitability_pct ?? 30
      const maxInvestment = projectedRevenue * (1 - targetPct / 100)
      const remainingBudget = maxInvestment - totalCosts

      return {
        id: b.id,
        pond_name: pondInfo?.name ?? 'S/E',
        species: pondInfo?.species ?? 'Pescado',
        population,
        avg_weight: avgWeightKg,
        biomass_kg: biomassKg,
        sale_price: salePrice,
        projected_revenue: projectedRevenue,
        total_feed_cost: totalFeedCost,
        total_labor_cost: laborCostTotal,
        total_fingerling_cost: fingerlingCostTotal,
        total_bio_cost: bioCostTotal,
        total_costs: totalCosts,
        utility,
        profitability_pct: profitabilityPct,
        target_pct: targetPct,
        remaining_budget: remainingBudget,
        days_active: daysActive,
      }
    })

    // ── concentrates ────────────────────────────────────────────
    concentrates = (rawConcentrates ?? []).map(c => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      price_per_kg: Number(c.price_per_kg),
      protein_pct: c.protein_pct != null ? Number(c.protein_pct) : null,
      is_active: c.is_active,
    }))

    // ── feed records with pond name ─────────────────────────────
    const batchPondMap: Record<string, string> = {}
    for (const b of orgRawBatches) batchPondMap[b.id] = pondMap[b.pond_id]?.name ?? 'S/E'

    feedRecords = (rawFeedRecords ?? [])
      .filter(r => orgBatchIds.has(r.batch_id))
      .map(r => ({
      id: r.id,
      batch_id: r.batch_id,
      concentrate_id: r.concentrate_id,
      pond_name: batchPondMap[r.batch_id] ?? 'S/E',
      concentrate_name: r.concentrate_name,
      production_stage: r.production_stage === 'levante' ? 'levante' : 'engorde',
      year: r.year,
      month: r.month,
      kg_used: Number(r.kg_used),
      cost_per_kg: Number(r.cost_per_kg),
    }))

    // ── harvests with pond name ─────────────────────────────────
    harvests = (rawHarvests ?? [])
      .filter(h => orgBatchIds.has(h.batch_id))
      .map(h => ({
      id: h.id,
      batch_id: h.batch_id,
      pond_name: batchPondMap[h.batch_id] ?? 'S/E',
      harvest_date: h.harvest_date,
      total_animals: h.total_animals,
      avg_weight_whole_g: Number(h.avg_weight_whole_g),
      avg_weight_eviscerated_g: h.avg_weight_eviscerated_g != null ? Number(h.avg_weight_eviscerated_g) : null,
      labor_cost: Number(h.labor_cost),
      notes: h.notes,
    }))
  }

  // ── aggregated KPIs ─────────────────────────────────────────
  const totalBioRevenue = treatments.reduce((s, t) => s + t.revenue, 0)
  const totalFishRevenue = batches.reduce((s, b) => s + b.projected_revenue, 0)
  const totalFishCosts = batches.reduce((s, b) => s + b.total_costs, 0)
  const totalFishUtility = totalFishRevenue - totalFishCosts
  const overallProfitability = totalFishRevenue > 0 ? (totalFishUtility / totalFishRevenue) * 100 : 0
  const totalFeedCostAll = batches.reduce((s, b) => s + b.total_feed_cost, 0)
  const totalLaborCostAll = batches.reduce((s, b) => s + b.total_labor_cost, 0)
  const totalFingerlingCostAll = batches.reduce((s, b) => s + b.total_fingerling_cost, 0)

  const batchesForForms = batches.map(b => ({
    id: b.id,
    pond_name: b.pond_name,
    species: b.species,
    initial_population: b.population,
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestión de Ventas y Utilidades</h1>
          <p className="mt-1 text-muted-foreground">Control de inversión, costos y rentabilidad por lote</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncMarketPricesButton />
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-1.5 border border-primary/20">
            <span className="text-xs font-semibold uppercase text-primary">Moneda: COP</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="investment" className="w-full">
        <TabsList className="flex w-full flex-wrap gap-1 h-auto sm:grid sm:grid-cols-5 sm:max-w-3xl">
          <TabsTrigger value="investment" className="gap-1.5 text-xs sm:text-sm">
            <Target className="h-3.5 w-3.5" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="fish" className="gap-1.5 text-xs sm:text-sm">
            <Fish className="h-3.5 w-3.5" />
            Ventas
          </TabsTrigger>
          <TabsTrigger value="feed" className="gap-1.5 text-xs sm:text-sm">
            <Wheat className="h-3.5 w-3.5" />
            Alimentación
          </TabsTrigger>
          <TabsTrigger value="harvest" className="gap-1.5 text-xs sm:text-sm">
            <Scale className="h-3.5 w-3.5" />
            Cosecha
          </TabsTrigger>
          <TabsTrigger value="bio" className="gap-1.5 text-xs sm:text-sm">
            <FlaskConical className="h-3.5 w-3.5" />
            Bioremediación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="investment" className="mt-6">
          <InvestmentTab
            batches={batches}
            totalFishRevenue={totalFishRevenue}
            totalFishCosts={totalFishCosts}
            totalFishUtility={totalFishUtility}
            overallProfitability={overallProfitability}
            totalFeedCostAll={totalFeedCostAll}
            totalLaborCostAll={totalLaborCostAll}
            totalFingerlingCostAll={totalFingerlingCostAll}
          />
        </TabsContent>

        <TabsContent value="fish" className="mt-6">
          <FishTab
            batches={batches}
            marketPrices={marketPrices}
            totalFishRevenue={totalFishRevenue}
            totalFishCosts={totalFishCosts}
            totalFishUtility={totalFishUtility}
          />
        </TabsContent>

        <TabsContent value="feed" className="mt-6">
          <FeedTab
            concentrates={concentrates}
            batchesForForms={batchesForForms}
            feedRecords={feedRecords}
          />
        </TabsContent>

        <TabsContent value="harvest" className="mt-6">
          <HarvestTab harvests={harvests} batchesForForms={batchesForForms} />
        </TabsContent>

        <TabsContent value="bio" className="mt-6">
          <BioTab treatments={treatments} totalBioRevenue={totalBioRevenue} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
