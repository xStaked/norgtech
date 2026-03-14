import { api } from '@/lib/api/client'

export type KnowledgeSpeciesType = 'both' | 'poultry' | 'swine'

export interface KnowledgeAuthor {
  id: string
  fullName: string | null
  email: string | null
}

export interface KnowledgeArticlePayload {
  title: string
  content: string
  category: string
  speciesType?: KnowledgeSpeciesType
  tags?: string[]
  isPublished?: boolean
}

export interface KnowledgeArticle {
  id: string
  organizationId: string
  title: string
  content: string
  category: string
  speciesType: KnowledgeSpeciesType | string
  tags: string[]
  isPublished: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  author?: KnowledgeAuthor | null
}

export interface ListKnowledgeParams {
  page?: number
  limit?: number
  category?: string
  speciesType?: string
  search?: string
  tags?: string[]
  isPublished?: boolean
}

export interface KnowledgeListResponse {
  items: KnowledgeArticle[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface SearchKnowledgePayload {
  query: string
  category?: string
  speciesType?: string
  tags?: string[]
  publishedOnly?: boolean
}

function buildQuery(params: ListKnowledgeParams = {}) {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        search.set(key, value.join(','))
      }
      return
    }

    search.set(key, String(value))
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export function getKnowledgeSpeciesLabel(speciesType: string) {
  if (speciesType === 'poultry') return 'Avícola'
  if (speciesType === 'swine') return 'Porcino'
  if (speciesType === 'both') return 'Ambas especies'
  return speciesType
}

export function getKnowledgeStatusLabel(isPublished: boolean) {
  return isPublished ? 'Publicado' : 'Borrador'
}

export function getKnowledgeExcerpt(content: string, length = 180) {
  const normalized = content.replace(/[#>*`_\-\n]/g, ' ').replace(/\s+/g, ' ').trim()
  if (normalized.length <= length) {
    return normalized
  }

  return `${normalized.slice(0, length).trim()}...`
}

export async function listKnowledgeArticles(params: ListKnowledgeParams = {}) {
  return api.get<KnowledgeListResponse>(`/knowledge${buildQuery(params)}`)
}

export async function searchKnowledge(payload: SearchKnowledgePayload) {
  return api.post<KnowledgeListResponse>('/knowledge/search', payload)
}

export async function getKnowledgeArticle(id: string) {
  return api.get<KnowledgeArticle>(`/knowledge/${id}`)
}

export async function createKnowledgeArticle(payload: KnowledgeArticlePayload) {
  return api.post<KnowledgeArticle>('/knowledge', payload)
}

export async function updateKnowledgeArticle(id: string, payload: KnowledgeArticlePayload) {
  return api.put<KnowledgeArticle>(`/knowledge/${id}`, payload)
}

export async function deleteKnowledgeArticle(id: string) {
  return api.delete<{ success: boolean; id: string }>(`/knowledge/${id}`)
}
