import { api } from '@/lib/api/client'

export type FarmSpecies = 'poultry' | 'swine'

export interface FarmPayload {
  clientId: string
  name: string
  speciesType: FarmSpecies
  location?: string
  capacity?: number
  assignedAdvisorId?: string
}

export interface FarmClientSummary {
  id: string
  fullName: string
  companyName: string | null
  status?: string | null
  phone?: string | null
  email?: string | null
}

export interface FarmVisitSummary {
  id: string
  advisorId: string
  visitDate: string
  observations?: string | null
  recommendations?: string | null
  createdAt?: string
}

export interface FarmListItem {
  id: string
  clientId: string
  organizationId: string
  name: string
  speciesType: FarmSpecies | string
  location: string | null
  capacity: number | null
  assignedAdvisorId: string | null
  createdAt: string
  updatedAt: string
  client: FarmClientSummary
  _count?: {
    cases: number
    visits: number
  }
}

export interface FarmDetail extends FarmListItem {
  visits: FarmVisitSummary[]
}

export interface FarmStats {
  farm: {
    id: string
    name: string
    speciesType: string
    capacity: number | null
  } | null
  kpis: {
    totalVisits: number
    totalCases: number
    openCases: number
    closedCases: number
    capacity: number | null
  }
  lastVisit: FarmVisitSummary | null
}

export interface FarmListResponse {
  items: FarmListItem[]
  meta: {
    total: number
    filters: ListFarmsParams
  }
}

export interface ListFarmsParams {
  clientId?: string
  speciesType?: string
  advisorId?: string
}

function buildQuery(params: ListFarmsParams = {}) {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    search.set(key, String(value))
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export function getFarmSpeciesLabel(speciesType: string) {
  if (speciesType === 'poultry') return 'Avícola'
  if (speciesType === 'swine') return 'Porcino'
  return speciesType
}

export async function listFarms(params: ListFarmsParams = {}) {
  return api.get<FarmListResponse>(`/farms${buildQuery(params)}`)
}

export async function getFarm(id: string) {
  return api.get<FarmDetail>(`/farms/${id}`)
}

export async function getFarmStats(id: string) {
  return api.get<FarmStats>(`/farms/${id}/stats`)
}

export async function createFarmRecord(payload: FarmPayload) {
  return api.post<FarmDetail>('/farms', payload)
}

export async function updateFarmRecord(id: string, payload: Partial<FarmPayload>) {
  return api.put<FarmDetail>(`/farms/${id}`, payload)
}
