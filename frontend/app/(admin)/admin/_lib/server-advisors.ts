import { requireAdminUser } from '@/lib/auth/server'
import type { AdvisorOption } from '@/lib/admin/advisors'

const ADVISOR_ROLES = ['admin', 'asesor_tecnico', 'asesor_comercial']

export async function fetchAdvisorOptions(): Promise<AdvisorOption[]> {
  const { supabase, profile } = await requireAdminUser()

  if (!profile?.organization_id) {
    return []
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('organization_id', profile.organization_id)
    .in('role', ADVISOR_ROLES)
    .order('full_name', { ascending: true })

  if (error) {
    throw new Error('No se pudo cargar el directorio de asesores.')
  }

  return (data ?? []).map((advisor) => ({
    id: advisor.id,
    fullName: advisor.full_name,
    email: advisor.email,
    role: advisor.role,
  }))
}
