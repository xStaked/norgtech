import type { CaseDetail, CaseListResponse } from '@/lib/api/cases'
import type { PortalDashboardStats } from '@/lib/api/dashboard'
import type { FarmListResponse } from '@/lib/api/farms'
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
  return fetchBackend<FarmListResponse>('/farms')
}

export async function fetchPortalVisits() {
  return fetchBackend<VisitListResponse>('/visits')
}
