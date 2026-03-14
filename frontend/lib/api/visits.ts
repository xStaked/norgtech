import { api } from '@/lib/api/client'

export interface VisitPayload {
  caseId?: string
  clientId: string
  farmId: string
  advisorId: string
  visitDate: string
  birdCount?: number
  mortalityCount?: number
  feedConversion?: number
  avgBodyWeight?: number
  animalCount?: number
  dailyWeightGain?: number
  feedConsumption?: number
  observations?: string
  recommendations?: string
}

export interface VisitCaseSummary {
  id: string
  caseNumber: number
  title: string
  status: string
  severity: string
}

export interface VisitClientSummary {
  id: string
  fullName: string
  companyName?: string | null
  status?: string | null
}

export interface VisitFarmSummary {
  id: string
  name: string
  speciesType: 'poultry' | 'swine' | string
  location?: string | null
  capacity?: number | null
}

export interface VisitSpeciesMetrics {
  birdCount?: number | null
  mortalityCount?: number | null
  feedConversion?: number | null
  avgBodyWeight?: number | null
  animalCount?: number | null
  dailyWeightGain?: number | null
  feedConsumption?: number | null
}

export interface VisitListItem {
  id: string
  organizationId: string
  caseId: string | null
  clientId: string
  farmId: string
  advisorId: string
  visitDate: string
  birdCount: number | null
  mortalityCount: number | null
  feedConversion: number | null
  avgBodyWeight: number | null
  animalCount: number | null
  dailyWeightGain: number | null
  feedConsumption: number | null
  observations: string | null
  recommendations: string | null
  createdAt: string
  client: VisitClientSummary
  farm: VisitFarmSummary
  case: VisitCaseSummary | null
  speciesMetrics: VisitSpeciesMetrics
}

export interface VisitDetail extends VisitListItem {}

export interface ListVisitsParams {
  advisorId?: string
  clientId?: string
  farmId?: string
  dateFrom?: string
  dateTo?: string
}

export interface VisitListResponse {
  items: VisitListItem[]
  meta: {
    total: number
    filters: ListVisitsParams
  }
}

function buildQuery(params: ListVisitsParams = {}) {
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

export function getVisitSpeciesLabel(speciesType: string) {
  if (speciesType === 'poultry') return 'Avícola'
  if (speciesType === 'swine') return 'Porcino'
  return speciesType
}

export function getVisitMetricLabel(metric: keyof VisitSpeciesMetrics) {
  if (metric === 'birdCount') return 'Aves'
  if (metric === 'mortalityCount') return 'Mortalidad'
  if (metric === 'feedConversion') return 'Conversión'
  if (metric === 'avgBodyWeight') return 'Peso promedio'
  if (metric === 'animalCount') return 'Animales'
  if (metric === 'dailyWeightGain') return 'Ganancia diaria'
  if (metric === 'feedConsumption') return 'Consumo alimento'
  return metric
}

export async function listVisits(params: ListVisitsParams = {}) {
  return api.get<VisitListResponse>(`/visits${buildQuery(params)}`)
}

export async function getVisit(id: string) {
  return api.get<VisitDetail>(`/visits/${id}`)
}

export async function getFarmVisits(farmId: string) {
  return api.get<VisitListItem[]>(`/visits/farm/${farmId}`)
}

export async function createVisitRecord(payload: VisitPayload) {
  return api.post<VisitDetail>('/visits', payload)
}

export async function updateVisitRecord(id: string, payload: Partial<VisitPayload>) {
  return api.put<VisitDetail>(`/visits/${id}`, payload)
}
