import type {
  CaseDetail,
  CaseListResponse,
  CaseStatsResponse,
  ListCasesParams,
} from '@/lib/api/cases'
import { fetchBackend, toQueryString } from '../../_lib/backend-api'

export async function fetchCases(params: ListCasesParams = {}) {
  return fetchBackend<CaseListResponse>(
    `/cases${toQueryString(params as Record<string, string | number | undefined>)}`,
  )
}

export async function fetchCase(id: string) {
  return fetchBackend<CaseDetail>(`/cases/${id}`)
}

export async function fetchCaseStats() {
  return fetchBackend<CaseStatsResponse>('/cases/stats')
}
