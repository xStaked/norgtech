import type {
  KnowledgeArticle,
  KnowledgeListResponse,
  ListKnowledgeParams,
  SearchKnowledgePayload,
} from '@/lib/api/knowledge'
import { fetchBackend, toQueryString } from '../../_lib/backend-api'

export async function fetchKnowledgeArticles(params: ListKnowledgeParams = {}) {
  const queryParams: Record<string, string | number | undefined> = {
    page: params.page,
    limit: params.limit,
    category: params.category,
    speciesType: params.speciesType,
    search: params.search,
    tags: params.tags?.join(','),
    isPublished:
      params.isPublished !== undefined ? String(params.isPublished) : undefined,
  }

  return fetchBackend<KnowledgeListResponse>(
    `/knowledge${toQueryString(queryParams)}`,
  )
}

export async function fetchKnowledgeArticle(id: string) {
  return fetchBackend<KnowledgeArticle>(`/knowledge/${id}`)
}

export async function searchKnowledgeArticles(payload: SearchKnowledgePayload) {
  return fetchBackend<KnowledgeListResponse>('/knowledge/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
