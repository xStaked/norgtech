import type {
  ClientDetail,
  ClientListResponse,
  ClientSummary,
  ListClientsParams,
} from '@/lib/api/clients'
import { fetchBackend, toQueryString } from '../../_lib/backend-api'

export async function fetchClients(params: ListClientsParams = {}) {
  return fetchBackend<ClientListResponse>(
    `/clients${toQueryString(params as Record<string, string | number | undefined>)}`,
  )
}

export async function fetchClient(id: string) {
  return fetchBackend<ClientDetail>(`/clients/${id}`)
}

export async function fetchClientSummary(id: string) {
  return fetchBackend<ClientSummary>(`/clients/${id}/summary`)
}
