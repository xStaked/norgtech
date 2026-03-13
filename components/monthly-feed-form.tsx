'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Plus, Wheat, Trash2, X, PlusCircle, Pencil } from 'lucide-react'
import {
  createMonthlyFeedRecord,
  updateMonthlyFeedRecord,
  deleteMonthlyFeedRecord,
  createConcentrate,
} from '@/app/dashboard/costs/actions'
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
  concentrate_id: string | null
  pond_name: string
  concentrate_name: string
  production_stage: 'levante' | 'engorde'
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
  production_stage: 'engorde' as const,
  year: String(now.getFullYear()),
  month: String(now.getMonth() + 1),
  kg_used: '',
  cost_per_kg: '',
  notes: '',
}

const emptyQuick = { name: '', brand: '', price_per_kg: '' }

export function MonthlyFeedForm({ batches, concentrates, feedRecords }: MonthlyFeedFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [editTarget, setEditTarget] = useState<FeedRecord | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [editError, setEditError] = useState('')

  // Inline concentrate quick-create
  const [showQuick, setShowQuick] = useState(false)
  const [quickForm, setQuickForm] = useState(emptyQuick)
  const [quickError, setQuickError] = useState('')
  const [pendingSelect, setPendingSelect] = useState('')

  // Auto-select concentrate created inline after router.refresh() updates the props
  useEffect(() => {
    if (pendingSelect && concentrates.length > 0) {
      const found = concentrates.find(c => c.name === pendingSelect)
      if (found) {
        handleConcentrateChange(found.id)
        setPendingSelect('')
      }
    }
  }, [concentrates, pendingSelect])

  const totalCost = (Number(form.kg_used) || 0) * (Number(form.cost_per_kg) || 0)
  const editTotalCost = (Number(editForm.kg_used) || 0) * (Number(editForm.cost_per_kg) || 0)

  const handleConcentrateChange = (id: string) => {
    const c = concentrates.find(x => x.id === id)
    setForm(f => ({
      ...f,
      concentrate_id: id,
      cost_per_kg: c ? String(c.price_per_kg) : f.cost_per_kg,
    }))
  }

  const handleEditConcentrateChange = (id: string) => {
    const c = concentrates.find(x => x.id === id)
    setEditForm(f => ({
      ...f,
      concentrate_id: id,
      cost_per_kg: c ? String(c.price_per_kg) : f.cost_per_kg,
    }))
  }

  const handleQuickCreate = () => {
    if (!quickForm.name.trim() || !quickForm.price_per_kg) {
      setQuickError('Nombre y precio son requeridos')
      return
    }
    setQuickError('')
    startTransition(async () => {
      try {
        await createConcentrate({
          name: quickForm.name.trim(),
          brand: quickForm.brand.trim() || undefined,
          price_per_kg: Number(quickForm.price_per_kg),
        })
        setPendingSelect(quickForm.name.trim())
        setQuickForm(emptyQuick)
        setShowQuick(false)
        router.refresh()
      } catch (e: any) {
        setQuickError(e.message)
      }
    })
  }

  const handleDialogOpen = (v: boolean) => {
    setOpen(v)
    if (v) {
      setForm(emptyForm)
      setError('')
      // Auto-show quick form if no concentrates exist
      setShowQuick(concentrates.length === 0)
      setQuickForm(emptyQuick)
      setQuickError('')
    }
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
          production_stage: form.production_stage,
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

  const handleOpenEdit = (record: FeedRecord) => {
    const fallbackConcentrateId = concentrates.find(c => c.name === record.concentrate_name)?.id ?? ''
    setEditForm({
      batch_id: record.batch_id,
      concentrate_id: record.concentrate_id ?? fallbackConcentrateId,
      production_stage: record.production_stage,
      year: String(record.year),
      month: String(record.month),
      kg_used: String(record.kg_used),
      cost_per_kg: String(record.cost_per_kg),
      notes: '',
    })
    setEditError('')
    setEditTarget(record)
  }

  const handleEdit = () => {
    if (!editTarget || !editForm.batch_id || !editForm.concentrate_id || !editForm.kg_used || !editForm.year || !editForm.month) {
      setEditError('Lote, concentrado, kg y período son requeridos')
      return
    }
    if (!editForm.cost_per_kg || Number(editForm.cost_per_kg) <= 0) {
      setEditError('El precio por kg debe ser mayor a 0')
      return
    }
    setEditError('')
    const concentrate = concentrates.find(c => c.id === editForm.concentrate_id)
    startTransition(async () => {
      try {
        await updateMonthlyFeedRecord(editTarget.id, {
          batch_id: editForm.batch_id,
          concentrate_id: editForm.concentrate_id,
          concentrate_name: concentrate?.name ?? editForm.concentrate_id,
          production_stage: editForm.production_stage,
          year: Number(editForm.year),
          month: Number(editForm.month),
          kg_used: Number(editForm.kg_used),
          cost_per_kg: Number(editForm.cost_per_kg),
        })
        setEditTarget(null)
      } catch (e: any) {
        setEditError(e.message)
      }
    })
  }

  const byMonth = feedRecords.reduce<Record<string, { totalKg: number; totalCost: number }>>((acc, r) => {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`
    if (!acc[key]) acc[key] = { totalKg: 0, totalCost: 0 }
    acc[key].totalKg += r.kg_used
    acc[key].totalCost += r.kg_used * r.cost_per_kg
    return acc
  }, {})

  const byStage = feedRecords.reduce<Record<'levante' | 'engorde', { totalKg: number; totalCost: number }>>((acc, r) => {
    acc[r.production_stage].totalKg += r.kg_used
    acc[r.production_stage].totalCost += r.kg_used * r.cost_per_kg
    return acc
  }, {
    levante: { totalKg: 0, totalCost: 0 },
    engorde: { totalKg: 0, totalCost: 0 },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wheat className="h-4 w-4" />
          <span>{feedRecords.length} registro{feedRecords.length !== 1 ? 's' : ''} de alimentación</span>
        </div>
        <Dialog open={open} onOpenChange={handleDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
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

                {/* Concentrado */}
                <div className="col-span-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Concentrado / Alimento *</Label>
                    {concentrates.length > 0 && !showQuick && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
                        onClick={() => { setShowQuick(true); setQuickError('') }}
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                        Agregar nuevo
                      </button>
                    )}
                  </div>

                  {/* Select from existing concentrates */}
                  {concentrates.length > 0 && !showQuick && (
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

                  {/* Inline quick-create form */}
                  {showQuick && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-primary">
                          {concentrates.length === 0
                            ? 'Primero registra el alimento que usas'
                            : 'Nuevo concentrado'}
                        </span>
                        {concentrates.length > 0 && (
                          <button
                            type="button"
                            onClick={() => { setShowQuick(false); setQuickError('') }}
                            className="cursor-pointer text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2 flex flex-col gap-1">
                          <Label className="text-xs">Nombre del alimento *</Label>
                          <Input
                            placeholder="Ej: Purina 32%, Mojarra Inicio…"
                            value={quickForm.name}
                            onChange={e => setQuickForm(f => ({ ...f, name: e.target.value }))}
                            className="h-8 text-sm"
                            autoFocus
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Marca / Proveedor</Label>
                          <Input
                            placeholder="Ej: Italcol"
                            value={quickForm.brand}
                            onChange={e => setQuickForm(f => ({ ...f, brand: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Precio/kg (COP) *</Label>
                          <Input
                            type="number"
                            min="0"
                            step="100"
                            placeholder="Ej: 2800"
                            value={quickForm.price_per_kg}
                            onChange={e => setQuickForm(f => ({ ...f, price_per_kg: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      {quickError && <p className="text-xs text-destructive">{quickError}</p>}
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleQuickCreate}
                        disabled={isPending}
                        className="w-full"
                      >
                        {isPending ? 'Creando…' : 'Crear y seleccionar'}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Año y Mes */}
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
                  <Label>Etapa del costo *</Label>
                  <Select
                    value={form.production_stage}
                    onValueChange={v => setForm(f => ({ ...f, production_stage: v as 'levante' | 'engorde' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="levante">Levante</SelectItem>
                      <SelectItem value="engorde">Engorde</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Usa levante si ese consumo debe sumarse al costo histórico del lote antes del engorde.
                  </p>
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
            <TableHead>Etapa</TableHead>
            <TableHead>Concentrado</TableHead>
            <TableHead>Kg usados</TableHead>
            <TableHead>Precio/kg</TableHead>
            <TableHead>Costo total</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                No hay registros de alimentación. Agrega el consumo mensual de cada lote.
              </TableCell>
            </TableRow>
          ) : (
            feedRecords.map(r => (
              <TableRow key={r.id} className="transition-colors hover:bg-muted/40">
                <TableCell className="font-medium">
                  {MONTHS[r.month - 1]} {r.year}
                </TableCell>
                <TableCell>{r.pond_name}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.production_stage === 'levante'
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {r.production_stage === 'levante' ? 'Levante' : 'Engorde'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.concentrate_name}</TableCell>
                <TableCell>{r.kg_used.toLocaleString()} kg</TableCell>
                <TableCell>{formatCOP(r.cost_per_kg)}</TableCell>
                <TableCell className="font-semibold text-primary">
                  {formatCOP(r.kg_used * r.cost_per_kg)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Dialog open={editTarget?.id === r.id} onOpenChange={o => !o && setEditTarget(null)}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 cursor-pointer"
                          onClick={() => handleOpenEdit(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Editar registro de alimento</DialogTitle>
                        </DialogHeader>
                        <div className="flex flex-col gap-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 flex flex-col gap-1.5">
                              <Label>Lote / Estanque *</Label>
                              <Select value={editForm.batch_id} onValueChange={v => setEditForm(f => ({ ...f, batch_id: v }))}>
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
                              <Label>Concentrado / Alimento *</Label>
                              <Select value={editForm.concentrate_id} onValueChange={handleEditConcentrateChange}>
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
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label>Año *</Label>
                              <Input
                                type="number"
                                min="2020"
                                max="2030"
                                value={editForm.year}
                                onChange={e => setEditForm(f => ({ ...f, year: e.target.value }))}
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label>Mes *</Label>
                              <Select value={editForm.month} onValueChange={v => setEditForm(f => ({ ...f, month: v }))}>
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
                              <Label>Etapa del costo *</Label>
                              <Select
                                value={editForm.production_stage}
                                onValueChange={v => setEditForm(f => ({ ...f, production_stage: v as 'levante' | 'engorde' }))}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="levante">Levante</SelectItem>
                                  <SelectItem value="engorde">Engorde</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label>Kg usados *</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.1"
                                value={editForm.kg_used}
                                onChange={e => setEditForm(f => ({ ...f, kg_used: e.target.value }))}
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label>Precio/kg (COP) *</Label>
                              <Input
                                type="number"
                                min="0"
                                step="100"
                                value={editForm.cost_per_kg}
                                onChange={e => setEditForm(f => ({ ...f, cost_per_kg: e.target.value }))}
                              />
                            </div>
                          </div>

                          {editTotalCost > 0 && (
                            <div className="rounded-lg border bg-primary/5 p-3 text-sm">
                              <span className="text-muted-foreground">Costo total del mes: </span>
                              <span className="font-bold text-primary">{formatCOP(editTotalCost)}</span>
                            </div>
                          )}

                          {editError && <p className="text-xs text-destructive">{editError}</p>}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
                          <Button onClick={handleEdit} disabled={isPending}>
                            {isPending ? 'Guardando…' : 'Actualizar'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 cursor-pointer text-destructive hover:text-destructive"
                      onClick={() => handleDelete(r.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Monthly summary */}
      {Object.keys(byMonth).length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-4 grid gap-2 md:grid-cols-2">
            {([
              ['levante', 'Levante'],
              ['engorde', 'Engorde'],
            ] as const).map(([key, label]) => (
              <div key={key} className="rounded border bg-background p-3 text-sm">
                <div className="text-muted-foreground">{label}</div>
                <div className="mt-1 font-bold text-primary">{formatCOP(byStage[key].totalCost)}</div>
                <div className="text-xs text-muted-foreground">{byStage[key].totalKg.toFixed(1)} kg acumulados</div>
              </div>
            ))}
          </div>
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
