import { api } from '@/lib/api/client'

export type CalculatorSpecies = 'poultry' | 'swine'
export type FcaBenchmarkStatus = 'excellent' | 'watch' | 'critical'
export type ProductionProgram = 'broiler' | 'layer' | 'swine'
export type RoiPaybackStatus = 'high' | 'medium' | 'low'

export interface FcaCalculationPayload {
  farmId?: string
  speciesType: CalculatorSpecies
  birdCount: number
  mortalityCount: number
  feedConsumedKg: number
  birdWeightKg: number
  initialWeightKg?: number
  feedCostPerKg: number
  marketPricePerKg?: number
  benchmarkFca?: number
}

export interface FcaCalculationFarm {
  id: string
  name: string
  speciesType: CalculatorSpecies | string
  client: {
    id: string
    fullName: string
    companyName: string | null
  }
}

export interface FcaCalculationItem {
  id: string
  userId: string
  organizationId: string
  farmId: string | null
  createdAt: string
  speciesType: CalculatorSpecies | string
  inputs: {
    birdCount: number
    mortalityCount: number
    aliveBirds: number
    feedConsumedKg: number
    birdWeightKg: number
    initialWeightKg: number
    feedCostPerKg: number
    marketPricePerKg: number
  }
  results: {
    fca: number
    benchmarkFca: number
    gapVsBenchmark: number
    benchmarkStatus: FcaBenchmarkStatus
    totalWeightGainKg: number
    productionCostPerKg: number
    estimatedLosses: number
    potentialSavings: number
    finalBiomassKg: number
    mortalityRate: number
  }
  farm: FcaCalculationFarm | null
}

export interface FcaHistoryResponse {
  items: FcaCalculationItem[]
  meta: {
    total: number
  }
}

export interface RoiCalculationPayload {
  farmId?: string
  feedSavings: number
  weightGainValue: number
  additiveCost: number
}

export interface RoiCalculationItem {
  id: string
  userId: string
  organizationId: string
  farmId: string | null
  feedSavings: number
  weightGainValue: number
  additiveCost: number
  roiPercentage: number
  netValue: number
  breakEven: number
  totalBenefits: number
  paybackStatus: RoiPaybackStatus
  createdAt: string
  farm: FcaCalculationFarm | null
}

export interface RoiHistoryResponse {
  items: RoiCalculationItem[]
  meta: {
    total: number
    limit: number
    filters: {
      farmId?: string
      limit?: number
    }
  }
}

export interface RoiHistoryParams {
  farmId?: string
  limit?: number
}

export interface ProductionSimulationPayload {
  programType: ProductionProgram
  farmId?: string
  initialAnimalCount: number
  startingWeightKg: number
  targetWeightKg: number
  cycleWeeks: number
  weeklyMortalityRatePct: number
  feedConversionRate: number
  feedCostPerKg: number
  salePricePerKg: number
}

export interface ProductionSimulationPoint {
  week: number
  animalsAlive: number
  avgWeightKg: number
  biomassKg: number
  weeklyFeedKg: number
  cumulativeFeedKg: number
  cumulativeFeedCost: number
  projectedRevenue: number
  projectedMargin: number
}

export interface ProductionSimulationResult {
  programType: ProductionProgram
  programLabel: string
  assumptions: {
    cycleWeeks: number
    feedConversionRate: number
    weeklyMortalityRatePct: number
    feedCostPerKg: number
    salePricePerKg: number
  }
  summary: {
    initialAnimalCount: number
    finalAnimalsAlive: number
    totalMortalityPct: number
    finalWeightKg: number
    finalBiomassKg: number
    totalFeedKg: number
    totalFeedCost: number
    projectedRevenue: number
    projectedMargin: number
    marginPerAnimal: number
  }
  weeklyProjection: ProductionSimulationPoint[]
}

export function getCalculatorSpeciesLabel(speciesType: string) {
  if (speciesType === 'poultry') return 'Avícola'
  if (speciesType === 'swine') return 'Porcino'
  return speciesType
}

export function getFcaBenchmarkStatusLabel(status: FcaBenchmarkStatus) {
  if (status === 'excellent') return 'En meta'
  if (status === 'watch') return 'En vigilancia'
  return 'Fuera de meta'
}

function buildQuery(params: Record<string, string | number | undefined>) {
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

export function getProductionProgramLabel(programType: ProductionProgram) {
  if (programType === 'broiler') return 'Broiler'
  if (programType === 'layer') return 'Ponedora'
  return 'Cerdo'
}

export async function calculateFca(payload: FcaCalculationPayload) {
  return api.post<FcaCalculationItem>('/calculators/fca', payload)
}

export async function getFcaHistory() {
  return api.get<FcaHistoryResponse>('/calculators/fca')
}

export async function calculateRoi(payload: RoiCalculationPayload) {
  return api.post<RoiCalculationItem>('/calculators/roi', payload)
}

export async function getRoiHistory(params: RoiHistoryParams = {}) {
  return api.get<RoiHistoryResponse>(`/calculators/roi${buildQuery(params)}`)
}

export async function runProductionSimulation(payload: ProductionSimulationPayload) {
  return api.post<ProductionSimulationResult>('/calculators/production-sim', payload)
}
