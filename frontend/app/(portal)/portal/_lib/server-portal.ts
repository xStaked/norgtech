import type { CaseDetail, CaseListResponse } from '@/lib/api/cases'
import type { PortalDashboardStats } from '@/lib/api/dashboard'
import type {
  ProducerFarmDetail,
  ProducerFarmListResponse,
  ProducerOperatingUnitDetail,
  ProducerOperatingUnitListResponse,
} from '@/lib/api/portal-farms'
import type { VisitListResponse } from '@/lib/api/visits'
import { fetchBackend } from '@/app/(admin)/admin/_lib/backend-api'

export async function fetchPortalDashboard() {
  return fetchBackend<PortalDashboardStats>('/dashboard/portal-stats')
}

export async function fetchPortalCases() {
  return fetchBackend<CaseListResponse>('/cases')
}

export async function fetchPortalCase(id: string) {
  return fetchBackend<CaseDetail>(`/cases/${id}`)
}

export async function fetchPortalFarms() {
  return fetchBackend<ProducerFarmListResponse>('/portal/farms')
}

export async function fetchPortalFarm(id: string) {
  return fetchBackend<ProducerFarmDetail>(`/portal/farms/${id}`)
}

export async function fetchPortalOperatingUnits(farmId?: string) {
  const query = farmId ? `?farmId=${encodeURIComponent(farmId)}` : ''
  return fetchBackend<ProducerOperatingUnitListResponse>(`/portal/operating-units${query}`)
}

export async function fetchPortalOperatingUnit(id: string) {
  return fetchBackend<ProducerOperatingUnitDetail>(`/portal/operating-units/${id}`)
}

export async function fetchPortalVisits() {
  return fetchBackend<VisitListResponse>('/visits')
}
