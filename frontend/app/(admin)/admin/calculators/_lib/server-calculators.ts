import type {
  FcaHistoryResponse,
  RoiHistoryParams,
  RoiHistoryResponse,
} from '@/lib/api/calculators'
import { fetchBackend, toQueryString } from '../../_lib/backend-api'

export async function fetchFcaHistory() {
  return fetchBackend<FcaHistoryResponse>('/calculators/fca')
}

export async function fetchRoiHistory(params: RoiHistoryParams = {}) {
  return fetchBackend<RoiHistoryResponse>(
    `/calculators/roi${toQueryString(params as Record<string, string | number | undefined>)}`,
  )
}
