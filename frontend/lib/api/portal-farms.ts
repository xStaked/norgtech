import { api } from '@/lib/api/client'
import type { FarmSpecies } from '@/lib/api/farms'
import { getFarmSpeciesLabel } from '@/lib/api/farms'

export interface ProducerFarmPayload {
  name: string
  speciesType: FarmSpecies
  location?: string
  capacity?: number
  assignedAdvisorId?: string
}

export interface ProducerOperatingUnitPayload {
  farmId: string
  name: string
  displayName?: string
  unitType?: string
  capacity?: number
  status?: 'active' | 'inactive'
  metadata?: Record<string, unknown>
}

export interface UpdateProducerOperatingUnitPayload
  extends Partial<Omit<ProducerOperatingUnitPayload, 'farmId'>> {}

export interface ProducerFarmSummary {
  id: string
  name: string
  speciesType: FarmSpecies | string
}

export interface ProducerFarmClientSummary {
  id: string
  fullName: string
  companyName: string | null
  phone: string | null
  email: string | null
}

export interface ProducerOperatingUnitListItem {
  id: string
  farmId: string
  clientId: string
  organizationId: string
  name: string
  displayName: string | null
  speciesType: FarmSpecies | string
  unitType: string | null
  capacity: number | null
  status: 'active' | 'inactive' | string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  farm: ProducerFarmSummary
  _count?: {
    visits: number
    cases: number
  }
}

export interface ProducerFarmListItem {
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
  client: ProducerFarmClientSummary
  _count?: {
    visits: number
    cases: number
    operatingUnits: number
  }
}

export interface ProducerFarmDetail extends ProducerFarmListItem {
  visits: Array<{
    id: string
    advisorId: string
    visitDate: string
    observations?: string | null
    recommendations?: string | null
    createdAt?: string
  }>
  operatingUnits: ProducerOperatingUnitListItem[]
}

export interface ProducerOperatingUnitDetail extends ProducerOperatingUnitListItem {
  visits: Array<{
    id: string
    advisorId: string
    visitDate: string
    observations?: string | null
    recommendations?: string | null
    createdAt?: string
  }>
}

export interface ListProducerFarmsParams {
  speciesType?: string
}

export interface ListProducerOperatingUnitsParams {
  farmId?: string
  status?: string
}

export interface ProducerFarmListResponse {
  items: ProducerFarmListItem[]
  meta: {
    total: number
    filters: ListProducerFarmsParams
  }
}

export interface ProducerOperatingUnitListResponse {
  items: ProducerOperatingUnitListItem[]
  meta: {
    total: number
    filters: ListProducerOperatingUnitsParams
  }
}

function buildQuery<T extends object>(params: T) {
  const search = new URLSearchParams()

  Object.entries(params as Record<string, string | number | null | undefined>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    search.set(key, String(value))
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export function getOperatingUnitStatusLabel(status: string) {
  if (status === 'active') return 'Activa'
  if (status === 'inactive') return 'Inactiva'
  return status
}

export { getFarmSpeciesLabel }

export async function listProducerFarms(params: ListProducerFarmsParams = {}) {
  return api.get<ProducerFarmListResponse>(`/portal/farms${buildQuery(params)}`)
}

export async function getProducerFarm(id: string) {
  return api.get<ProducerFarmDetail>(`/portal/farms/${id}`)
}

export async function createProducerFarm(payload: ProducerFarmPayload) {
  return api.post<ProducerFarmDetail>('/portal/farms', payload)
}

export async function updateProducerFarm(
  id: string,
  payload: Partial<ProducerFarmPayload>,
) {
  return api.put<ProducerFarmDetail>(`/portal/farms/${id}`, payload)
}

export async function listProducerOperatingUnits(
  params: ListProducerOperatingUnitsParams = {},
) {
  return api.get<ProducerOperatingUnitListResponse>(
    `/portal/operating-units${buildQuery(params)}`,
  )
}

export async function listProducerFarmOperatingUnits(farmId: string) {
  return api.get<ProducerOperatingUnitListResponse>(`/portal/farms/${farmId}/operating-units`)
}

export async function getProducerOperatingUnit(id: string) {
  return api.get<ProducerOperatingUnitDetail>(`/portal/operating-units/${id}`)
}

export async function createProducerOperatingUnit(
  payload: ProducerOperatingUnitPayload,
) {
  return api.post<ProducerOperatingUnitDetail>('/portal/operating-units', payload)
}

export async function updateProducerOperatingUnit(
  id: string,
  payload: UpdateProducerOperatingUnitPayload,
) {
  return api.put<ProducerOperatingUnitDetail>(`/portal/operating-units/${id}`, payload)
}
