export interface AdvisorOption {
  id: string
  fullName: string | null
  email: string | null
  role: 'admin' | 'asesor_tecnico' | 'asesor_comercial' | 'cliente' | string
}

export function getAdvisorDisplayName(advisor: AdvisorOption) {
  return advisor.fullName?.trim() || advisor.email || advisor.id
}

export function getAdvisorRoleLabel(role: string) {
  if (role === 'admin') return 'Administrador'
  if (role === 'asesor_tecnico') return 'Asesor técnico'
  if (role === 'asesor_comercial') return 'Asesor comercial'
  if (role === 'cliente') return 'Cliente'
  return role
}
