import type {
  ListVisitsParams,
  VisitDetail,
  VisitListItem,
  VisitListResponse,
} from '@/lib/api/visits'
import { fetchBackend, toQueryString } from '../../_lib/backend-api'

export async function fetchVisits(params: ListVisitsParams = {}) {
  return fetchBackend<VisitListResponse>(
    `/visits${toQueryString(params as Record<string, string | number | undefined>)}`,
  )
}

export async function fetchVisit(id: string) {
  return fetchBackend<VisitDetail>(`/visits/${id}`)
}

export async function fetchFarmVisits(farmId: string) {
  return fetchBackend<VisitListItem[]>(`/visits/farm/${farmId}`)
}
