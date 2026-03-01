'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Wheat, Trash2 } from 'lucide-react'
import { createMonthlyFeedRecord, deleteMonthlyFeedRecord } from '@/app/dashboard/costs/actions'
import { formatCOP } from '@/lib/format'

interface Batch {
  id: string
  pond_name: string
  species: string
}

interface Concentrate {
  id: string
  name: string
  brand: string | null
  price_per_kg: number
}

interface FeedRecord {
  id: string
  batch_id: string
  pond_name: string
  concentrate_name: string
  year: number
  month: number
  kg_used: number
  cost_per_kg: number
}

interface MonthlyFeedFormProps {
  batches: Batch[]
  concentrates: Concentrate[]
  feedRecords: FeedRecord[]
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const now = new Date()
const emptyForm = {
  batch_id: '',
  concentrate_id: '',
  year: String(now.getFullYear()),
  month: String(now.getMonth() + 1),
  kg_used: '',
  cost_per_kg: '',
  notes: '',
}

export function MonthlyFeedForm({ batches, concentrates, feedRecords }: MonthlyFeedFormProps) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const selectedConcentrate = concentrates.find(c => c.id === form.concentrate_id)
  const totalCost = (Number(form.kg_used) || 0) * (Number(form.cost_per_kg) || 0)

  // Auto-fill price when concentrate selected
  const handleConcentrateChange = (id: string) => {
    const c = concentrates.find(x => x.id === id)
    setForm(f => ({
      ...f,
      concentrate_id: id,
      cost_per_kg: c ? String(c.price_per_kg) : f.cost_per_kg,
    }))
  }

  const handleSubmit = () => {
    if (!form.batch_id || !form.concentrate_id || !form.kg_used || !form.year || !form.month) {
      setError('Lote, concentrado, kg y período son requeridos')
      return
    }
    if (!form.cost_per_kg || Number(form.cost_per_kg) <= 0) {
      setError('El precio por kg debe ser mayor a 0')
      return
    }
    setError('')
    const concentrate = concentrates.find(c => c.id === form.concentrate_id)
    startTransition(async () => {
      try {
        await createMonthlyFeedRecord({
          batch_id: form.batch_id,
          concentrate_id: form.concentrate_id || null,
          concentrate_name: concentrate?.name ?? form.concentrate_id,
          year: Number(form.year),
          month: Number(form.month),
          kg_used: Number(form.kg_used),
          cost_per_kg: Number(form.cost_per_kg),
          notes: form.notes || undefined,
        })
        setOpen(false)
        setForm(emptyForm)
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => { await deleteMonthlyFeedRecord(id) })
  }

  // Group records by month for summary
  const byMonth = feedRecords.reduce<Record<string, { totalKg: number; totalCost: number; items: FeedRecord[] }>>((acc, r) => {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`
    if (!acc[key]) acc[key] = { totalKg: 0, totalCost: 0, items: [] }
    acc[key].totalKg += r.kg_used
    acc[key].totalCost += r.kg_used * r.cost_per_kg
    acc[key].items.push(r)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wheat className="h-4 w-4" />
          <span>{feedRecords.length} registro{feedRecords.length !== 1 ? 's' : ''} de alimentación</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" onClick={() => { setForm(emptyForm); setError('') }}>
              <Plus className="h-4 w-4" />
              Registrar alimento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registro de alimento mensual</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label>Lote / Estanque *</Label>
                  <Select value={form.batch_id} onValueChange={v => setForm(f => ({ ...f, batch_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar lote…" />
                    </SelectTrigger>
                    <SelectContent>
                      {batches.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.pond_name} — {b.species}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label>Concentrado *</Label>
                  {concentrates.length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                      No hay concentrados configurados. Agrega uno en la pestaña "Concentrados".
                    </p>
                  ) : (
                    <Select value={form.concentrate_id} onValueChange={handleConcentrateChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar concentrado…" />
                      </SelectTrigger>
                      <SelectContent>
                        {concentrates.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} — {formatCOP(c.price_per_kg)}/kg
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Año *</Label>
                  <Input
                    type="number"
                    min="2020"
                    max="2030"
                    value={form.year}
                    onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Mes *</Label>
                  <Select value={form.month} onValueChange={v => setForm(f => ({ ...f, month: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="f-kg">Kg usados *</Label>
                  <Input
                    id="f-kg"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Ej: 120"
                    value={form.kg_used}
                    onChange={e => setForm(f => ({ ...f, kg_used: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="f-price">Precio/kg (COP) *</Label>
                  <Input
                    id="f-price"
                    type="number"
                    min="0"
                    step="100"
                    placeholder="Ej: 2800"
                    value={form.cost_per_kg}
                    onChange={e => setForm(f => ({ ...f, cost_per_kg: e.target.value }))}
                  />
                </div>
              </div>

              {totalCost > 0 && (
                <div className="rounded-lg border bg-primary/5 p-3 text-sm">
                  <span className="text-muted-foreground">Costo total del mes: </span>
                  <span className="font-bold text-primary">{formatCOP(totalCost)}</span>
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending ? 'Guardando…' : 'Registrar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead>Concentrado</TableHead>
            <TableHead>Kg usados</TableHead>
            <TableHead>Precio/kg</TableHead>
            <TableHead>Costo total</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                No hay registros de alimentación. Agrega el consumo mensual de cada lote.
              </TableCell>
            </TableRow>
          ) : (
            feedRecords.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {MONTHS[r.month - 1]} {r.year}
                </TableCell>
                <TableCell>{r.pond_name}</TableCell>
                <TableCell className="text-muted-foreground">{r.concentrate_name}</TableCell>
                <TableCell>{r.kg_used.toLocaleString()} kg</TableCell>
                <TableCell>{formatCOP(r.cost_per_kg)}</TableCell>
                <TableCell className="font-semibold text-primary">
                  {formatCOP(r.kg_used * r.cost_per_kg)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 cursor-pointer text-destructive hover:text-destructive"
                    onClick={() => handleDelete(r.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Monthly summary */}
      {Object.keys(byMonth).length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-3 text-sm font-semibold">Resumen por mes</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(byMonth)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([key, val]) => {
                const [yr, mo] = key.split('-')
                return (
                  <div key={key} className="flex items-center justify-between rounded border bg-background p-2 text-sm">
                    <span className="font-medium">{MONTHS[Number(mo) - 1]} {yr}</span>
                    <div className="text-right">
                      <div className="font-bold text-primary">{formatCOP(val.totalCost)}</div>
                      <div className="text-xs text-muted-foreground">{val.totalKg.toFixed(0)} kg</div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
