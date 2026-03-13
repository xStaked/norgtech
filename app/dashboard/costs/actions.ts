'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getOrgId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (!profile?.organization_id) throw new Error('Sin organización')
  return { supabase, user, orgId: profile.organization_id }
}

// ── Concentrados ──────────────────────────────────────────────

export async function createConcentrate(data: {
  name: string
  brand?: string
  price_per_kg: number
  protein_pct?: number
}) {
  const { supabase, orgId } = await getOrgId()
  const { error } = await supabase.from('feed_concentrates').insert({
    organization_id: orgId,
    name: data.name,
    brand: data.brand || null,
    price_per_kg: data.price_per_kg,
    protein_pct: data.protein_pct ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}

export async function updateConcentrate(id: string, data: {
  name: string
  brand?: string
  price_per_kg: number
  protein_pct?: number
  is_active: boolean
}) {
  const { supabase, orgId } = await getOrgId()
  const { error } = await supabase
    .from('feed_concentrates')
    .update({
      name: data.name,
      brand: data.brand || null,
      price_per_kg: data.price_per_kg,
      protein_pct: data.protein_pct ?? null,
      is_active: data.is_active,
    })
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}

export async function deleteConcentrate(id: string) {
  const { supabase, orgId } = await getOrgId()
  const { error } = await supabase
    .from('feed_concentrates')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}

// ── Registros mensuales de alimento ───────────────────────────

export async function createMonthlyFeedRecord(data: {
  batch_id: string
  concentrate_id: string | null
  concentrate_name: string
  production_stage: 'levante' | 'engorde'
  year: number
  month: number
  kg_used: number
  cost_per_kg: number
  notes?: string
}) {
  const { supabase } = await getOrgId()
  const { error } = await supabase.from('monthly_feed_records').upsert(
    {
      batch_id: data.batch_id,
      concentrate_id: data.concentrate_id || null,
      concentrate_name: data.concentrate_name,
      production_stage: data.production_stage,
      year: data.year,
      month: data.month,
      kg_used: data.kg_used,
      cost_per_kg: data.cost_per_kg,
      notes: data.notes || null,
    },
    { onConflict: 'batch_id,concentrate_id,year,month,production_stage' }
  )
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}

export async function updateMonthlyFeedRecord(id: string, data: {
  batch_id: string
  concentrate_id: string
  concentrate_name: string
  production_stage: 'levante' | 'engorde'
  year: number
  month: number
  kg_used: number
  cost_per_kg: number
}) {
  const { supabase } = await getOrgId()
  const { error } = await supabase
    .from('monthly_feed_records')
    .update({
      batch_id: data.batch_id,
      concentrate_id: data.concentrate_id,
      concentrate_name: data.concentrate_name,
      production_stage: data.production_stage,
      year: data.year,
      month: data.month,
      kg_used: data.kg_used,
      cost_per_kg: data.cost_per_kg,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}

export async function deleteMonthlyFeedRecord(id: string) {
  const { supabase } = await getOrgId()
  const { error } = await supabase.from('monthly_feed_records').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}

// ── Registros de cosecha ───────────────────────────────────────

export async function createHarvestRecord(data: {
  batch_id: string
  harvest_date: string
  total_animals: number
  avg_weight_whole_g: number
  avg_weight_eviscerated_g?: number
  labor_cost: number
  notes?: string
}) {
  const { supabase } = await getOrgId()
  const { error } = await supabase.from('harvest_records').insert({
    batch_id: data.batch_id,
    harvest_date: data.harvest_date,
    total_animals: data.total_animals,
    avg_weight_whole_g: data.avg_weight_whole_g,
    avg_weight_eviscerated_g: data.avg_weight_eviscerated_g ?? null,
    labor_cost: data.labor_cost,
    notes: data.notes || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}

export async function deleteHarvestRecord(id: string) {
  const { supabase } = await getOrgId()
  const { error } = await supabase.from('harvest_records').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}

// ── Configuración de lote (precio venta, rentabilidad objetivo) ─

export async function updateBatchSalesConfig(batchId: string, data: {
  sale_price_per_kg?: number
  target_profitability_pct?: number
  fingerling_cost_per_unit?: number
  avg_weight_at_seeding_g?: number
  labor_cost_per_month?: number
}) {
  const { supabase } = await getOrgId()
  const update: Record<string, number | undefined> = {}
  if (data.sale_price_per_kg !== undefined) update.sale_price_per_kg = data.sale_price_per_kg
  if (data.target_profitability_pct !== undefined) update.target_profitability_pct = data.target_profitability_pct
  if (data.fingerling_cost_per_unit !== undefined) update.fingerling_cost_per_unit = data.fingerling_cost_per_unit
  if (data.avg_weight_at_seeding_g !== undefined) update.avg_weight_at_seeding_g = data.avg_weight_at_seeding_g
  if (data.labor_cost_per_month !== undefined) update.labor_cost_per_month = data.labor_cost_per_month
  const { error } = await supabase.from('batches').update(update).eq('id', batchId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
}
