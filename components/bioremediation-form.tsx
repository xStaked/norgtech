'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Calculator, Droplets, Save, Fish, Wind,
  FlaskConical, CheckCircle2, AlertCircle,
} from 'lucide-react'
import {
  useBioremediation,
  SPECIES_CONFIG, AERATION_OPTIONS, AGE_OPTIONS,
  fmtDose,
  type ProductKey,
} from '@/hooks/use-bioremediation'

// ─── Product UI config (kept here — contains JSX icons) ──────────────────────

const PRODUCTS: Record<ProductKey, {
  name: string
  type: string
  description: string
  icon: React.ReactNode
  colorClass: string
  selectedClass: string
  badgeClass: string
  resultBg: string
  resultText: string
  resultBorder: string
}> = {
  bioaquapro: {
    name: 'BioAquaPro',
    type: 'Producto de agua',
    description: 'Tratamiento acuático de alta concentración. Mejora la calidad del agua y reduce cargas orgánicas.',
    icon: <Droplets className="h-7 w-7" />,
    colorClass: 'text-sky-600 dark:text-sky-400',
    selectedClass: 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 ring-2 ring-sky-500/30',
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
    resultBg: 'bg-sky-50 dark:bg-sky-950/40',
    resultText: 'text-sky-700 dark:text-sky-300',
    resultBorder: 'border-sky-200 dark:border-sky-800',
  },
  bioterrapro: {
    name: 'BioTerraPro',
    type: 'Producto de suelo',
    description: 'Bioremediador de fondos de estanque. Para sedimentos y suelos con alta carga orgánica.',
    icon: <FlaskConical className="h-7 w-7" />,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    selectedClass: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 ring-2 ring-emerald-500/30',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    resultBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    resultText: 'text-emerald-700 dark:text-emerald-300',
    resultBorder: 'border-emerald-200 dark:border-emerald-800',
  },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BioremediationForm() {
  const {
    length, setLength, width, setWidth, depth, setDepth,
    species, setSpecies, ageMonths, setAgeMonths,
    stockingDensity, setStockingDensity, aeration, setAeration,
    selectedProduct, handleProductSelect,
    canCalculate, previewArea, previewHa, previewVolume,
    result, isSaving, saved, handleCalculate, handleSave,
  } = useBioremediation()

  const prod = selectedProduct ? PRODUCTS[selectedProduct] : null

  return (
    <div className="flex flex-col gap-8">

      {/* ── 1. Selección de producto ─────────────────── */}
      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paso 1</p>
          <p className="mt-0.5 text-base font-semibold text-foreground">Selecciona el producto</p>
          <p className="text-sm text-muted-foreground">La dosis se ajusta según el tipo de producto</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.entries(PRODUCTS) as [ProductKey, typeof PRODUCTS[ProductKey]][]).map(([key, p]) => (
            <button
              key={key}
              onClick={() => handleProductSelect(key)}
              className={`group relative flex w-full cursor-pointer items-start gap-4 rounded-xl border-2 p-5 text-left transition-all duration-200 ${
                selectedProduct === key
                  ? p.selectedClass
                  : 'border-border bg-card hover:border-muted-foreground/30 hover:shadow-sm'
              }`}
            >
              {selectedProduct === key && (
                <span className={`absolute right-4 top-4 ${p.colorClass}`}>
                  <CheckCircle2 className="h-5 w-5" />
                </span>
              )}
              <span className={`mt-0.5 shrink-0 transition-colors ${selectedProduct === key ? p.colorClass : 'text-muted-foreground group-hover:text-foreground'}`}>
                {p.icon}
              </span>
              <div className="flex flex-col gap-1 pr-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{p.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.badgeClass}`}>
                    {p.type}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                {key === 'bioterrapro' && (
                  <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Sin aireación: se aplica la mitad de la dosis
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── 2. Parámetros ────────────────────────────── */}
      <section className={`transition-opacity duration-300 ${selectedProduct ? 'opacity-100' : 'pointer-events-none select-none opacity-40'}`}>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paso 2</p>
          <p className="mt-0.5 text-base font-semibold text-foreground">Parámetros del estanque</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Dimensiones */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calculator className="h-4 w-4 text-primary" />
                Dimensiones
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="length" className="text-xs">Largo (m)</Label>
                  <Input id="length" type="number" step="0.1" placeholder="20"
                    value={length} onChange={e => setLength(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="width" className="text-xs">Ancho (m)</Label>
                  <Input id="width" type="number" step="0.1" placeholder="10"
                    value={width} onChange={e => setWidth(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="depth" className="text-xs">Prof. (m)</Label>
                  <Input id="depth" type="number" step="0.1" placeholder="1.5"
                    value={depth} onChange={e => setDepth(e.target.value)} />
                </div>
              </div>
              {previewArea != null && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Área: <strong className="text-foreground">{previewArea.toFixed(1)} m²</strong>
                  {' · '}
                  <strong className="text-foreground">{previewHa!.toFixed(4)} ha</strong>
                  {previewVolume != null && (
                    <> · Vol: <strong className="text-foreground">{previewVolume.toFixed(1)} m³</strong></>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Producción */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Fish className="h-4 w-4 text-primary" />
                Producción
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="species" className="text-xs">Especie</Label>
                <Select value={species} onValueChange={v => setSpecies(v as typeof species)}>
                  <SelectTrigger id="species">
                    <SelectValue placeholder="Seleccionar especie" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SPECIES_CONFIG) as [typeof species, { label: string; baseDosePerHa: number }][]).map(
                      ([key, { label, baseDosePerHa }]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                          <span className="ml-1.5 text-xs text-muted-foreground">· {baseDosePerHa} g/ha</span>
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="age" className="text-xs">Edad</Label>
                  <Select value={ageMonths} onValueChange={setAgeMonths}>
                    <SelectTrigger id="age">
                      <SelectValue placeholder="Meses" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {ageMonths && Number(ageMonths) > 2 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">+0.05 g/m² por edad</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="density" className="text-xs">Densidad (peces/m²)</Label>
                  <Input id="density" type="number" step="1" min="1" placeholder="Ej: 7"
                    value={stockingDensity} onChange={e => setStockingDensity(e.target.value)} />
                  {stockingDensity && Number(stockingDensity) >= 10 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">Alta densidad +20%</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Wind className="h-3 w-3" />
                  Aireación
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {AERATION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAeration(opt.value)}
                      className={`cursor-pointer rounded-lg border px-2 py-2 text-center text-xs font-medium transition-all duration-150 ${
                        aeration === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {selectedProduct === 'bioterrapro' && aeration === '0' && (
                  <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      BioTerraPro sin aireación: se aplicará la <strong>mitad de la dosis</strong>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Button
          size="lg"
          onClick={handleCalculate}
          disabled={!canCalculate}
          className="mt-6 w-full sm:w-auto"
        >
          <Calculator className="h-4 w-4 mr-2" />
          Calcular dosis de {prod?.name ?? '...'}
        </Button>
      </section>

      {/* ── 3. Resultado ─────────────────────────────── */}
      {result && prod && (
        <section>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Paso 3</p>
            <p className="mt-0.5 text-base font-semibold text-foreground">Resultado</p>
          </div>

          <Card className={`border-2 ${PRODUCTS[result.product].resultBorder}`}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <span className={PRODUCTS[result.product].colorClass}>{prod.icon}</span>
                  {prod.name}
                </CardTitle>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${prod.badgeClass}`}>
                  {prod.type}
                </span>
              </div>
              <CardDescription>
                {result.speciesLabel} · {result.ageMonths} {result.ageMonths === 1 ? 'mes' : 'meses'} ·{' '}
                {result.stockingDensity} peces/m² ·{' '}
                Aireación: {AERATION_OPTIONS.find(a => a.value === result.aeration)?.label}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">

              {/* Dosis principal */}
              <div className={`rounded-xl border-2 ${PRODUCTS[result.product].resultBorder} ${PRODUCTS[result.product].resultBg} p-6 text-center`}>
                {result.aerationHalved && (
                  <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Dosis reducida 50% por ausencia de aireación
                  </div>
                )}
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Dosis recomendada
                </p>
                <p className={`text-5xl font-bold ${PRODUCTS[result.product].resultText}`}>
                  {fmtDose(result.finalDoseG)}
                </p>
                {result.finalDoseG >= 1000 && (
                  <p className="mt-1 text-sm text-muted-foreground">{result.finalDoseG.toFixed(0)} g</p>
                )}
              </div>

              {/* Métricas */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Área',       value: `${result.areaM2.toFixed(0)} m²` },
                  { label: 'Hectáreas',  value: `${result.areaHa.toFixed(4)} ha` },
                  { label: 'Volumen',    value: `${result.volume.toFixed(1)} m³` },
                  { label: 'Dosis base', value: `${result.baseDosePerHa} g/ha` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 font-semibold text-foreground">{value}</p>
                  </div>
                ))}
              </div>

              {/* Desglose */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Desglose</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Base ({result.baseDosePerHa} g/ha × {result.areaHa.toFixed(4)} ha)
                  </span>
                  <span className="font-medium tabular-nums">{result.baseDoseG.toFixed(2)} g</span>
                </div>
                {result.ageAdjustmentG > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Edad &gt;2 meses (0.05 g/m² × {result.areaM2} m²)
                    </span>
                    <span className="font-medium tabular-nums text-amber-600">+{result.ageAdjustmentG.toFixed(2)} g</span>
                  </div>
                )}
                {result.densityBonus && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Alta densidad ≥10 peces/m² (+20%)</span>
                    <span className="font-medium tabular-nums text-amber-600">+{result.densityBonusG.toFixed(2)} g</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Subtotal calculado</span>
                  <span className="tabular-nums">{result.baseCalcG.toFixed(2)} g</span>
                </div>
                {result.aerationHalved && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sin aireación — suelo (×0.5)</span>
                    <span className="font-medium tabular-nums text-amber-600">−{(result.baseCalcG / 2).toFixed(2)} g</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-sm font-bold">
                  <span>Dosis final</span>
                  <span className={`tabular-nums ${PRODUCTS[result.product].resultText}`}>
                    {result.finalDoseG.toFixed(2)} g
                  </span>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-muted-foreground">{result.speciesLabel}</Badge>
                {result.ageMonths > 2 && (
                  <Badge variant="outline" className="border-amber-300 text-amber-600">+Ajuste edad</Badge>
                )}
                {result.densityBonus && (
                  <Badge variant="outline" className="border-amber-300 text-amber-600">Alta densidad +20%</Badge>
                )}
                {result.aerationHalved && (
                  <Badge variant="outline" className="border-amber-300 text-amber-600">½ dosis sin aireación</Badge>
                )}
              </div>

              <Button variant="outline" className="gap-2 bg-transparent" onClick={handleSave} disabled={isSaving || saved}>
                <Save className="h-4 w-4" />
                {saved ? 'Guardado ✓' : isSaving ? 'Guardando...' : 'Guardar cálculo'}
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Tabla de referencia ──────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground">Dosis de referencia por especie</CardTitle>
          <CardDescription className="text-xs">
            Gramos por hectárea · haz clic para seleccionar la especie
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(Object.entries(SPECIES_CONFIG) as [typeof species, { label: string; baseDosePerHa: number }][]).map(
              ([key, { label, baseDosePerHa }]) => (
                <button
                  key={key}
                  onClick={() => setSpecies(key)}
                  className={`cursor-pointer rounded-lg border p-3 text-center transition-all duration-150 hover:shadow-sm ${
                    species === key
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{baseDosePerHa}</p>
                  <p className="text-xs text-muted-foreground">g/ha</p>
                </button>
              )
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
