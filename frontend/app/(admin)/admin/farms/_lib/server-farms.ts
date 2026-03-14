import type {
  FarmDetail,
  FarmListResponse,
  FarmStats,
  ListFarmsParams,
} from '@/lib/api/farms'
import { fetchBackend, toQueryString } from '../../_lib/backend-api'

export async function fetchFarms(params: ListFarmsParams = {}) {
  return fetchBackend<FarmListResponse>(
    `/farms${toQueryString(params as Record<string, string | number | undefined>)}`,
  )
}

export async function fetchFarm(id: string) {
  return fetchBackend<FarmDetail>(`/farms/${id}`)
}

export async function fetchFarmStats(id: string) {
  return fetchBackend<FarmStats>(`/farms/${id}/stats`)
}
