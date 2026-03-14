import type { DashboardStats } from '@/lib/api/dashboard'
import { fetchBackend } from '../../_lib/backend-api'

export async function fetchAdminDashboardStats() {
  return fetchBackend<DashboardStats>('/dashboard/admin-stats')
}

export async function fetchAdvisorDashboardStats() {
  return fetchBackend<DashboardStats>('/dashboard/advisor-stats')
}
