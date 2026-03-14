export type DashboardCaseStatus =
  | 'open'
  | 'in_analysis'
  | 'treatment'
  | 'waiting_client'

export interface DashboardAdvisorActivity {
  advisorId: string
  name: string
  openCases: number
  closedCases: number
  visitsThisMonth: number
}

export interface DashboardStats {
  activeClients: number
  openCases: number
  casesByStatus: Record<DashboardCaseStatus, number>
  avgResponseTimeHours: number
  visitsThisMonth: number
  advisorActivity: DashboardAdvisorActivity[]
}

export interface PortalDashboardStats {
  client: {
    id: string
    fullName: string
    companyName: string | null
  }
  openCases: number
  pendingRecommendations: number
  lastVisit: {
    id: string
    visitDate: string
    recommendations: string | null
    observations: string | null
    farm: {
      id: string
      name: string
      speciesType: string
    }
  } | null
  casesByStatus: Record<DashboardCaseStatus | 'closed', number>
  farms: number
}

export type DashboardActivityItem =
  | {
      id: string
      type: 'case'
      title: string
      description: string
      href: string
      createdAt: string
      meta: string
      tone: 'warning'
    }
  | {
      id: string
      type: 'visit'
      title: string
      description: string
      href: string
      createdAt: string
      meta: string
      tone: 'success'
    }

export function getDashboardStatusLabel(status: DashboardCaseStatus) {
  if (status === 'open') return 'Abiertos'
  if (status === 'in_analysis') return 'En análisis'
  if (status === 'treatment') return 'En tratamiento'
  return 'Esperando cliente'
}
