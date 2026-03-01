'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getOrCreateOrganization(orgName: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  // Use SECURITY DEFINER function to atomically create org + link profile
  const { data, error } = await supabase.rpc('create_organization_for_user', {
    org_name: orgName,
  })

  if (error) throw new Error(error.message)
  return data as string
}

export async function createPond(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  let orgId = profile?.organization_id

  // Auto-create org if needed
  if (!orgId) {
    const orgName = formData.get('org_name') as string || 'Mi Granja'
    orgId = await getOrCreateOrganization(orgName)
  }

  const { error } = await supabase.from('ponds').insert({
    organization_id: orgId,
    name: formData.get('name') as string,
    area_m2: Number(formData.get('area_m2')) || null,
    depth_m: Number(formData.get('depth_m')) || null,
    species: formData.get('species') as string || null,
    status: 'active',
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/ponds')
}

export async function deletePond(pondId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('ponds').delete().eq('id', pondId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/ponds')
}

export async function createBatch(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from('batches').insert({
    pond_id: formData.get('pond_id') as string,
    start_date: formData.get('start_date') as string,
    initial_population: Number(formData.get('initial_population')),
    current_population: Number(formData.get('initial_population')),
    status: 'active',
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/ponds')
}

export async function closeBatch(batchId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('batches')
    .update({ status: 'closed', end_date: new Date().toISOString().split('T')[0] })
    .eq('id', batchId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/ponds')
}
export async function updateBatchPrice(batchId: string, price: number) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('batches')
    .update({ sale_price_per_kg: price })
    .eq('id', batchId)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
  revalidatePath('/dashboard/ponds')
}

export async function updateBatchFinancialConfig(batchId: string, data: {
  sale_price_per_kg: number | null
  target_profitability_pct: number
  fingerling_cost_per_unit: number
  avg_weight_at_seeding_g: number | null
  labor_cost_per_month: number
}) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('batches')
    .update({
      sale_price_per_kg: data.sale_price_per_kg || null,
      target_profitability_pct: data.target_profitability_pct,
      fingerling_cost_per_unit: data.fingerling_cost_per_unit,
      avg_weight_at_seeding_g: data.avg_weight_at_seeding_g || null,
      labor_cost_per_month: data.labor_cost_per_month,
    })
    .eq('id', batchId)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/costs')
  revalidatePath('/dashboard/ponds')
}
