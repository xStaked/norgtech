'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpeciesKey =
  | 'tilapia-roja'
  | 'tilapia-negra'
  | 'cachama-blanca'
  | 'bocachico'
  | 'bagres'
  | 'trucha'

export type ProductKey = 'bioaquapro' | 'bioterrapro'

export interface CalcResult {
  volume: number
  areaM2: number
  areaHa: number
  baseDosePerHa: number
  baseDoseG: number
  ageAdjustmentG: number
  densityBonus: boolean
  densityBonusG: number
  baseCalcG: number
  finalDoseG: number
  aerationHalved: boolean
  speciesLabel: string
  ageMonths: number
  stockingDensity: number
  aeration: string
  product: ProductKey
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const SPECIES_CONFIG: Record<SpeciesKey, { label: string; baseDosePerHa: number }> = {
  'tilapia-roja':   { label: 'Tilapia Roja',   baseDosePerHa: 250 },
  'tilapia-negra':  { label: 'Tilapia Negra',  baseDosePerHa: 250 },
  'cachama-blanca': { label: 'Cachama Blanca', baseDosePerHa: 300 },
  'bocachico':      { label: 'Bocachico',      baseDosePerHa: 250 },
  'bagres':         { label: 'Bagres',         baseDosePerHa: 350 },
  'trucha':         { label: 'Trucha',         baseDosePerHa: 300 },
}

export const AERATION_OPTIONS = [
  { value: '0',  label: 'Ninguno' },
  { value: '12', label: '12 horas' },
  { value: '18', label: '18 horas' },
  { value: '24', label: '24 horas' },
] as const

export const AGE_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i + 1 === 1 ? 'mes' : 'meses'}`,
}))

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function calculateDose(params: {
  length: number
  width: number
  depth: number
  species: SpeciesKey
  ageMonths: number
  stockingDensity: number
  aeration: string
  product: ProductKey
}): CalcResult {
  const { length, width, depth, species, ageMonths, stockingDensity, aeration, product } = params

  const areaM2 = length * width
  const areaHa = areaM2 / 10000
  const volume = areaM2 * depth

  const { baseDosePerHa, label: speciesLabel } = SPECIES_CONFIG[species]
  const baseDoseG = baseDosePerHa * areaHa
  const ageAdjustmentG = ageMonths > 2 ? 0.05 * areaM2 : 0

  const subtotal = baseDoseG + ageAdjustmentG
  const densityBonus = stockingDensity >= 10
  const densityBonusG = densityBonus ? subtotal * 0.2 : 0
  const baseCalcG = subtotal + densityBonusG

  // BioTerraPro only: halve the dose when there is no aeration
  const aerationHalved = product === 'bioterrapro' && aeration === '0'
  const finalDoseG = aerationHalved ? baseCalcG / 2 : baseCalcG

  return {
    volume, areaM2, areaHa,
    baseDosePerHa, baseDoseG,
    ageAdjustmentG,
    densityBonus, densityBonusG,
    baseCalcG, finalDoseG,
    aerationHalved,
    speciesLabel, ageMonths, stockingDensity, aeration, product,
  }
}

export function fmtDose(g: number): string {
  return g < 1000 ? `${g.toFixed(1)} g` : `${(g / 1000).toFixed(3)} kg`
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBioremediation() {
  const [selectedProduct, setSelectedProduct] = useState<ProductKey | null>(null)

  const [length, setLength]                   = useState('')
  const [width, setWidth]                     = useState('')
  const [depth, setDepth]                     = useState('')
  const [species, setSpecies]                 = useState<SpeciesKey | ''>('')
  const [ageMonths, setAgeMonths]             = useState('')
  const [stockingDensity, setStockingDensity] = useState('')
  const [aeration, setAeration]               = useState('')

  const [result, setResult]     = useState<CalcResult | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved]       = useState(false)

  const canCalculate = Boolean(
    selectedProduct && length && width && depth && species && ageMonths && stockingDensity && aeration,
  )

  // Derived preview values (live, before calculating)
  const previewArea   = length && width ? Number(length) * Number(width) : null
  const previewHa     = previewArea != null ? previewArea / 10000 : null
  const previewVolume = previewArea != null && depth ? previewArea * Number(depth) : null

  function handleProductSelect(p: ProductKey) {
    setSelectedProduct(p)
    setResult(null)
    setSaved(false)
  }

  function handleCalculate() {
    if (!canCalculate) return
    setResult(calculateDose({
      length: Number(length),
      width: Number(width),
      depth: Number(depth),
      species: species as SpeciesKey,
      ageMonths: Number(ageMonths),
      stockingDensity: Number(stockingDensity),
      aeration,
      product: selectedProduct!,
    }))
    setSaved(false)
  }

  async function handleSave() {
    if (!result) return
    setIsSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      await supabase.from('bioremediation_calcs').insert({
        user_id: user.id,
        pond_length: Number(length),
        pond_width: Number(width),
        pond_depth: Number(depth),
        volume_m3: result.volume,
        bioremediation_dose: result.finalDoseG,
      })
      setSaved(true)
    } catch {
      alert('Error al guardar el cálculo')
    } finally {
      setIsSaving(false)
    }
  }

  return {
    // Form fields
    length, setLength,
    width, setWidth,
    depth, setDepth,
    species, setSpecies,
    ageMonths, setAgeMonths,
    stockingDensity, setStockingDensity,
    aeration, setAeration,
    // Product
    selectedProduct,
    handleProductSelect,
    // Derived
    canCalculate,
    previewArea,
    previewHa,
    previewVolume,
    // Result
    result,
    isSaving,
    saved,
    handleCalculate,
    handleSave,
  }
}
