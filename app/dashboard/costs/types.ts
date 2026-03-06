export const PRICE_PER_LITER = 52500

export type Treatment = {
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
}

export type BatchSummary = {
  id: string
  pond_name: string
  species: string
  population: number
  avg_weight: number
  biomass_kg: number
  sale_price: number
  projected_revenue: number
  total_feed_cost: number
  total_labor_cost: number
  total_fingerling_cost: number
  total_bio_cost: number
  total_costs: number
  utility: number
  profitability_pct: number
  target_pct: number
  remaining_budget: number
  days_active: number
}

export type Concentrate = {
  id: string
  name: string
  brand: string | null
  price_per_kg: number
  protein_pct: number | null
  is_active: boolean
}

export type FeedRecord = {
  id: string
  batch_id: string
  concentrate_id: string | null
  pond_name: string
  concentrate_name: string
  year: number
  month: number
  kg_used: number
  cost_per_kg: number
}

export type HarvestRecord = {
  id: string
  batch_id: string
  pond_name: string
  harvest_date: string
  total_animals: number
  avg_weight_whole_g: number
  avg_weight_eviscerated_g: number | null
  labor_cost: number
  notes: string | null
}

export type BatchForForms = {
  id: string
  pond_name: string
  species: string
  initial_population: number
}

export function profitabilityColor(pct: number, target: number) {
  if (pct >= target) return 'text-green-600'
  if (pct >= target * 0.6) return 'text-amber-600'
  return 'text-destructive'
}

export function profitabilityBadge(pct: number, target: number) {
  if (pct >= target) return 'border-green-500/30 text-green-600 bg-green-50'
  if (pct >= 0) return 'border-amber-400/30 text-amber-600 bg-amber-50'
  return 'border-destructive/30 text-destructive bg-red-50'
}
