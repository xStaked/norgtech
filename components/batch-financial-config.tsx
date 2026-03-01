'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Settings2 } from 'lucide-react'
import { updateBatchFinancialConfig } from '@/app/dashboard/ponds/actions'

interface BatchFinancialConfigProps {
  batchId: string
  initialPopulation: number
  current: {
    sale_price_per_kg: number | null
    target_profitability_pct: number | null
    fingerling_cost_per_unit: number | null
    avg_weight_at_seeding_g: number | null
    labor_cost_per_month: number | null
  }
}

export function BatchFinancialConfig({ batchId, initialPopulation, current }: BatchFinancialConfigProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    sale_price_per_kg: current.sale_price_per_kg != null ? String(current.sale_price_per_kg) : '',
    target_profitability_pct: current.target_profitability_pct != null ? String(current.target_profitability_pct) : '30',
    fingerling_cost_per_unit: current.fingerling_cost_per_unit != null ? String(current.fingerling_cost_per_unit) : '',
    avg_weight_at_seeding_g: current.avg_weight_at_seeding_g != null ? String(current.avg_weight_at_seeding_g) : '',
    labor_cost_per_month: current.labor_cost_per_month != null ? String(current.labor_cost_per_month) : '',
  })

  // Preview del costo total de alevinos
  const totalFingerlingCost =
    (Number(form.fingerling_cost_per_unit) || 0) * initialPopulation

  const handleSave = () => {
    const targetPct = Number(form.target_profitability_pct)
    if (!targetPct || targetPct < 0 || targetPct >= 100) {
      setError('El % de utilidad objetivo debe estar entre 0 y 99')
      return
    }
    setError('')
    startTransition(async () => {
      try {
        await updateBatchFinancialConfig(batchId, {
          sale_price_per_kg: form.sale_price_per_kg ? Number(form.sale_price_per_kg) : null,
          target_profitability_pct: targetPct,
          fingerling_cost_per_unit: Number(form.fingerling_cost_per_unit) || 0,
          avg_weight_at_seeding_g: form.avg_weight_at_seeding_g ? Number(form.avg_weight_at_seeding_g) : null,
          labor_cost_per_month: Number(form.labor_cost_per_month) || 0,
        })
        setOpen(false)
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  const field = (id: string, label: string, placeholder: string, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="0"
        step="any"
        placeholder={placeholder}
        value={form[id as keyof typeof form]}
        onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
          title="Configuración financiera"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configuración financiera del lote</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Ventas */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Venta</p>
            <div className="grid grid-cols-2 gap-3">
              {field('sale_price_per_kg', 'Precio de venta/kg (COP)', 'Ej: 9500',
                'Si se deja vacío se usará el precio de referencia SIPSA')}
              {field('target_profitability_pct', '% Utilidad objetivo *', '30',
                'Ej: 30 → quiere ganar el 30% del ingreso proyectado')}
            </div>
          </div>

          <Separator />

          {/* Costos */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Costos</p>
            <div className="grid grid-cols-2 gap-3">
              {field('fingerling_cost_per_unit', 'Costo por alevino (COP)', 'Ej: 150')}
              {field('avg_weight_at_seeding_g', 'Peso a la siembra (g)', 'Ej: 5')}
              {field('labor_cost_per_month', 'Mano de obra/mes (COP)', 'Ej: 1200000')}
            </div>

            {/* Preview alevinos */}
            {totalFingerlingCost > 0 && (
              <div className="rounded border bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Costo total alevinos ({initialPopulation.toLocaleString()} unid.): </span>
                <span className="font-semibold">
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(totalFingerlingCost)}
                </span>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
