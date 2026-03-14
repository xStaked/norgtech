import { api } from '@/lib/api/client'

export type CaseSeverity = 'low' | 'medium' | 'high' | 'critical'
export type CaseStatus =
  | 'open'
  | 'in_analysis'
  | 'treatment'
  | 'waiting_client'
  | 'closed'
export type CaseMessageType = 'note' | 'ai_suggestion' | 'status_change'

export interface CasePayload {
  clientId: string
  farmId?: string
  title: string
  description?: string
  severity: CaseSeverity
  assignedTechId?: string
}

export interface UpdateCasePayload {
  status?: CaseStatus
  severity?: CaseSeverity
  assignedTechId?: string
  note?: string
}

export interface AddCaseMessagePayload {
  content: string
  messageType: Extract<CaseMessageType, 'note' | 'ai_suggestion'>
}

export interface CaseClientSummary {
  id: string
  fullName: string
  companyName?: string | null
}

export interface CaseFarmSummary {
  id: string
  name: string
  speciesType?: string
}

export interface CaseMessage {
  id: string
  caseId: string
  userId: string
  content: string
  messageType: CaseMessageType | string
  createdAt: string
  author?: {
    id: string
    fullName: string | null
    email: string | null
    role: string
  } | null
}

export interface CaseListItem {
  id: string
  organizationId: string
  caseNumber: number
  title: string
  description: string | null
  severity: CaseSeverity | string
  status: CaseStatus | string
  assignedTechId: string | null
  clientId: string
  farmId: string | null
  source?: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  client: CaseClientSummary
  farm?: CaseFarmSummary | null
  _count?: {
    messages: number
  }
}

export interface CaseDetail extends CaseListItem {
  messages: CaseMessage[]
  visits?: Array<{
    id: string
    visitDate: string
    advisorId: string
    observations: string | null
    recommendations: string | null
  }>
}

export interface CaseStatsResponse {
  total?: number
  byStatus?: Partial<Record<CaseStatus, number>> & Record<string, number>
  open?: number
  in_analysis?: number
  treatment?: number
  waiting_client?: number
  closed?: number
}

export interface ListCasesParams {
  page?: number
  limit?: number
  status?: string
  severity?: string
  assignedTechId?: string
  clientId?: string
  farmId?: string
  search?: string
}

export interface CaseListResponse {
  items: CaseListItem[]
  meta?: {
    total?: number
    filters?: ListCasesParams
  }
}

function buildQuery(params: ListCasesParams = {}) {
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

export function formatCaseNumber(caseNumber: number) {
  return `CASO-${String(caseNumber).padStart(4, '0')}`
}

export function getCaseSeverityLabel(severity: string) {
  if (severity === 'critical') return 'Crítica'
  if (severity === 'high') return 'Alta'
  if (severity === 'medium') return 'Media'
  if (severity === 'low') return 'Baja'
  return severity
}

export function getCaseStatusLabel(status: string) {
  if (status === 'open') return 'Abierto'
  if (status === 'in_analysis') return 'En análisis'
  if (status === 'treatment') return 'En tratamiento'
  if (status === 'waiting_client') return 'Esperando cliente'
  if (status === 'closed') return 'Cerrado'
  return status
}

export function getCaseStatsMap(stats: CaseStatsResponse) {
  if (stats.byStatus) {
    return stats.byStatus
  }

  return {
    open: stats.open ?? 0,
    in_analysis: stats.in_analysis ?? 0,
    treatment: stats.treatment ?? 0,
    waiting_client: stats.waiting_client ?? 0,
    closed: stats.closed ?? 0,
  }
}

export async function listCases(params: ListCasesParams = {}) {
  return api.get<CaseListResponse>(`/cases${buildQuery(params)}`)
}

export async function getCase(id: string) {
  return api.get<CaseDetail>(`/cases/${id}`)
}

export async function getCaseStats() {
  return api.get<CaseStatsResponse>('/cases/stats')
}

export async function createCaseRecord(payload: CasePayload) {
  return api.post<CaseDetail>('/cases', payload)
}

export async function updateCaseRecord(id: string, payload: UpdateCasePayload) {
  return api.put<CaseDetail>(`/cases/${id}`, payload)
}

export async function addCaseMessage(id: string, payload: AddCaseMessagePayload) {
  return api.post<CaseMessage>(`/cases/${id}/messages`, payload)
}
