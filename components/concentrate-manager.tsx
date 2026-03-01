'use client'

import React, { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Pencil, Trash2, FlaskConical } from 'lucide-react'
import { createConcentrate, updateConcentrate, deleteConcentrate } from '@/app/dashboard/costs/actions'
import { formatCOP } from '@/lib/format'

interface Concentrate {
  id: string
  name: string
  brand: string | null
  price_per_kg: number
  protein_pct: number | null
  is_active: boolean
}

interface ConcentrateManagerProps {
  concentrates: Concentrate[]
}

const emptyForm = { name: '', brand: '', price_per_kg: '', protein_pct: '' }

type FormState = typeof emptyForm

interface FormFieldsProps {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  error: string
}

function FormFields({ form, setForm, error }: FormFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5 col-span-2">
          <Label htmlFor="c-name">Nombre del concentrado *</Label>
          <Input
            id="c-name"
            placeholder="Ej: Purina 32%"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-brand">Marca / Proveedor</Label>
          <Input
            id="c-brand"
            placeholder="Ej: Italcol"
            value={form.brand}
            onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-protein">% Proteína</Label>
          <Input
            id="c-protein"
            type="number"
            min="0"
            max="100"
            step="0.1"
            placeholder="Ej: 32"
            value={form.protein_pct}
            onChange={e => setForm(f => ({ ...f, protein_pct: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-2">
          <Label htmlFor="c-price">Precio por kg (COP) *</Label>
          <Input
            id="c-price"
            type="number"
            min="0"
            step="100"
            placeholder="Ej: 2800"
            value={form.price_per_kg}
            onChange={e => setForm(f => ({ ...f, price_per_kg: e.target.value }))}
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function ConcentrateManager({ concentrates }: ConcentrateManagerProps) {
  const [isPending, startTransition] = useTransition()
  const [openAdd, setOpenAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Concentrate | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const handleOpenAdd = () => {
    setForm(emptyForm)
    setError('')
    setOpenAdd(true)
  }

  const handleOpenEdit = (c: Concentrate) => {
    setForm({
      name: c.name,
      brand: c.brand ?? '',
      price_per_kg: String(c.price_per_kg),
      protein_pct: c.protein_pct != null ? String(c.protein_pct) : '',
    })
    setError('')
    setEditTarget(c)
  }

  const handleAdd = () => {
    if (!form.name.trim() || !form.price_per_kg) {
      setError('Nombre y precio son requeridos')
      return
    }
    setError('')
    startTransition(async () => {
      try {
        await createConcentrate({
          name: form.name.trim(),
          brand: form.brand.trim() || undefined,
          price_per_kg: Number(form.price_per_kg),
          protein_pct: form.protein_pct ? Number(form.protein_pct) : undefined,
        })
        setOpenAdd(false)
        setForm(emptyForm)
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  const handleEdit = () => {
    if (!editTarget || !form.name.trim() || !form.price_per_kg) {
      setError('Nombre y precio son requeridos')
      return
    }
    setError('')
    startTransition(async () => {
      try {
        await updateConcentrate(editTarget.id, {
          name: form.name.trim(),
          brand: form.brand.trim() || undefined,
          price_per_kg: Number(form.price_per_kg),
          protein_pct: form.protein_pct ? Number(form.protein_pct) : undefined,
          is_active: editTarget.is_active,
        })
        setEditTarget(null)
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteConcentrate(id)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FlaskConical className="h-4 w-4" />
          <span>{concentrates.length} concentrado{concentrates.length !== 1 ? 's' : ''} registrado{concentrates.length !== 1 ? 's' : ''}</span>
        </div>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={handleOpenAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo concentrado
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar concentrado</DialogTitle>
            </DialogHeader>
            <FormFields form={form} setForm={setForm} error={error} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenAdd(false)}>Cancelar</Button>
              <Button onClick={handleAdd} disabled={isPending}>
                {isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Marca</TableHead>
            <TableHead>Proteína</TableHead>
            <TableHead>Precio/kg</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {concentrates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                No hay concentrados registrados. Agrega uno para comenzar.
              </TableCell>
            </TableRow>
          ) : (
            concentrates.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">{c.brand ?? '—'}</TableCell>
                <TableCell>
                  {c.protein_pct != null ? (
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      {c.protein_pct}%
                    </Badge>
                  ) : '—'}
                </TableCell>
                <TableCell className="font-semibold">{formatCOP(c.price_per_kg)}/kg</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={c.is_active
                      ? 'border-green-500/30 text-green-600'
                      : 'border-muted text-muted-foreground'}
                  >
                    {c.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Dialog open={editTarget?.id === c.id} onOpenChange={open => !open && setEditTarget(null)}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 cursor-pointer"
                          onClick={() => handleOpenEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Editar concentrado</DialogTitle>
                        </DialogHeader>
                        <FormFields form={form} setForm={setForm} error={error} />
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
                      onClick={() => handleDelete(c.id)}
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
    </div>
  )
}
