'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'
import { Plus, Scale, Trash2, TrendingDown } from 'lucide-react'
import { createHarvestRecord, deleteHarvestRecord } from '@/app/dashboard/costs/actions'
import { formatCOP } from '@/lib/format'

interface Batch {
  id: string
  pond_name: string
  species: string
  initial_population: number
}

interface HarvestRecord {
  id: string
  batch_id: string
  pond_name: string
  harvest_date: string
  total_animals: number
  avg_weight_whole_g: number
  avg_weight_eviscerated_g: number | null
  labor_cost: number
  notes: string | null
}

interface HarvestFormProps {
  batches: Batch[]
  harvests: HarvestRecord[]
}

function calcMetrics(animals: number, wholeG: number, eviscG: number | null) {
  const totalWholeKg = (animals * wholeG) / 1000
  const totalEviscKg = eviscG != null ? (animals * eviscG) / 1000 : null
  const visceraKg = totalEviscKg != null ? totalWholeKg - totalEviscKg : null
  const shrinkagePct = eviscG != null && wholeG > 0 ? ((wholeG - eviscG) / wholeG) * 100 : null
  return { totalWholeKg, totalEviscKg, visceraKg, shrinkagePct }
}

const today = new Date().toISOString().split('T')[0]
const emptyForm = {
  batch_id: '',
  harvest_date: today,
  total_animals: '',
  avg_weight_whole_g: '',
  avg_weight_eviscerated_g: '',
  labor_cost: '',
  notes: '',
}

export function HarvestForm({ batches, harvests }: HarvestFormProps) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const animals = Number(form.total_animals) || 0
  const wholeG = Number(form.avg_weight_whole_g) || 0
  const eviscG = form.avg_weight_eviscerated_g ? Number(form.avg_weight_eviscerated_g) : null
  const preview = calcMetrics(animals, wholeG, eviscG)

  const handleSubmit = () => {
    if (!form.batch_id || !form.harvest_date || !form.total_animals || !form.avg_weight_whole_g) {
      setError('Lote, fecha, animales y peso entero son requeridos')
      return
    }
    setError('')
    startTransition(async () => {
      try {
        await createHarvestRecord({
          batch_id: form.batch_id,
          harvest_date: form.harvest_date,
          total_animals: Number(form.total_animals),
          avg_weight_whole_g: Number(form.avg_weight_whole_g),
          avg_weight_eviscerated_g: form.avg_weight_eviscerated_g ? Number(form.avg_weight_eviscerated_g) : undefined,
          labor_cost: Number(form.labor_cost) || 0,
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
    startTransition(async () => { await deleteHarvestRecord(id) })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Scale className="h-4 w-4" />
          <span>{harvests.length} cosecha{harvests.length !== 1 ? 's' : ''} registrada{harvests.length !== 1 ? 's' : ''}</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" onClick={() => { setForm(emptyForm); setError('') }}>
              <Plus className="h-4 w-4" />
              Registrar cosecha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Registro de cosecha y merma</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Lote */}
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

                {/* Fecha */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="h-date">Fecha de cosecha *</Label>
                  <Input
                    id="h-date"
                    type="date"
                    value={form.harvest_date}
                    onChange={e => setForm(f => ({ ...f, harvest_date: e.target.value }))}
                  />
                </div>

                {/* Animales */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="h-animals">N.° animales cosechados *</Label>
                  <Input
                    id="h-animals"
                    type="number"
                    min="1"
                    placeholder="Ej: 5000"
                    value={form.total_animals}
                    onChange={e => setForm(f => ({ ...f, total_animals: e.target.value }))}
                  />
                </div>

                {/* Pesos */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="h-whole">Peso prom. entero (g) *</Label>
                  <Input
                    id="h-whole"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Ej: 350"
                    value={form.avg_weight_whole_g}
                    onChange={e => setForm(f => ({ ...f, avg_weight_whole_g: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="h-evisc">Peso prom. eviscerado (g)</Label>
                  <Input
                    id="h-evisc"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Ej: 290"
                    value={form.avg_weight_eviscerated_g}
                    onChange={e => setForm(f => ({ ...f, avg_weight_eviscerated_g: e.target.value }))}
                  />
                </div>

                {/* Mano de obra */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="h-labor">Mano de obra (COP)</Label>
                  <Input
                    id="h-labor"
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="Ej: 500000"
                    value={form.labor_cost}
                    onChange={e => setForm(f => ({ ...f, labor_cost: e.target.value }))}
                  />
                </div>

                {/* Notas */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="h-notes">Notas</Label>
                  <Input
                    id="h-notes"
                    placeholder="Observaciones…"
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>

              {/* Preview de cálculos */}
              {animals > 0 && wholeG > 0 && (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Cálculos automáticos</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Peso total entero:</span>
                      <span className="ml-2 font-semibold">{preview.totalWholeKg.toFixed(2)} kg</span>
                    </div>
                    {preview.totalEviscKg != null && (
                      <>
                        <div>
                          <span className="text-muted-foreground">Peso total eviscerado:</span>
                          <span className="ml-2 font-semibold">{preview.totalEviscKg.toFixed(2)} kg</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Peso viscera total:</span>
                          <span className="ml-2 font-semibold text-amber-600">{preview.visceraKg!.toFixed(2)} kg</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">% Merma:</span>
                          <span className="ml-2 font-bold text-destructive">{preview.shrinkagePct!.toFixed(1)}%</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending ? 'Guardando…' : 'Registrar cosecha'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Lote</TableHead>
            <TableHead>Animales</TableHead>
            <TableHead>Peso entero</TableHead>
            <TableHead>Peso eviscerado</TableHead>
            <TableHead>% Merma</TableHead>
            <TableHead>Viscera total</TableHead>
            <TableHead>Mano de obra</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {harvests.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                No hay cosechas registradas.
              </TableCell>
            </TableRow>
          ) : (
            harvests.map(h => {
              const m = calcMetrics(h.total_animals, h.avg_weight_whole_g, h.avg_weight_eviscerated_g)
              return (
                <TableRow key={h.id}>
                  <TableCell className="text-sm">
                    {new Date(h.harvest_date + 'T12:00:00').toLocaleDateString('es-CO')}
                  </TableCell>
                  <TableCell className="font-medium">{h.pond_name}</TableCell>
                  <TableCell>{h.total_animals.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{m.totalWholeKg.toFixed(1)} kg</span>
                      <span className="text-xs text-muted-foreground">{h.avg_weight_whole_g}g/u</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.totalEviscKg != null ? (
                      <div className="flex flex-col">
                        <span className="font-medium">{m.totalEviscKg.toFixed(1)} kg</span>
                        <span className="text-xs text-muted-foreground">{h.avg_weight_eviscerated_g}g/u</span>
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {m.shrinkagePct != null ? (
                      <Badge variant="outline" className="border-destructive/30 text-destructive gap-1">
                        <TrendingDown className="h-3 w-3" />
                        {m.shrinkagePct.toFixed(1)}%
                      </Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {m.visceraKg != null ? (
                      <span className="text-amber-600 font-medium">{m.visceraKg.toFixed(1)} kg</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>{formatCOP(h.labor_cost)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 cursor-pointer text-destructive hover:text-destructive"
                      onClick={() => handleDelete(h.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
