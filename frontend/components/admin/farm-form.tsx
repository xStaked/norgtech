'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import type { AdvisorOption } from '@/lib/admin/advisors'
import type { ClientListItem } from '@/lib/api/clients'
import {
  createFarmRecord,
  updateFarmRecord,
  type FarmDetail,
  type FarmPayload,
  type FarmSpecies,
} from '@/lib/api/farms'
import { AdvisorSelect } from '@/components/admin/advisor-select'
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

interface FarmFormProps {
  advisors: AdvisorOption[]
  clients: ClientListItem[]
  mode: 'create' | 'edit'
  farm?: FarmDetail
}

interface FarmFormState {
  clientId: string
  name: string
  speciesType: FarmSpecies
  location: string
  capacity: string
  assignedAdvisorId: string
}

function toInitialState(farm?: FarmDetail): FarmFormState {
  return {
    clientId: farm?.clientId ?? '',
    name: farm?.name ?? '',
    speciesType: (farm?.speciesType as FarmSpecies) ?? 'poultry',
    location: farm?.location ?? '',
    capacity: farm?.capacity ? String(farm.capacity) : '',
    assignedAdvisorId: farm?.assignedAdvisorId ?? '',
  }
}

function normalizePayload(values: FarmFormState): FarmPayload {
  return {
    clientId: values.clientId,
    name: values.name.trim(),
    speciesType: values.speciesType,
    location: values.location.trim() || undefined,
    capacity: values.capacity ? Number(values.capacity) : undefined,
    assignedAdvisorId: values.assignedAdvisorId.trim() || undefined,
  }
}

export function FarmForm({ advisors, clients, mode, farm }: FarmFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<FarmFormState>(() => toInitialState(farm))
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!values.clientId) {
      setError('Debes seleccionar un productor.')
      return
    }

    if (!values.name.trim()) {
      setError('El nombre de la granja es obligatorio.')
      return
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = normalizePayload(values)
          const response =
            mode === 'create'
              ? await createFarmRecord(payload)
              : await updateFarmRecord(farm!.id, payload)

          router.push(`/admin/farms/${response.id}`)
          router.refresh()
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo guardar la granja.',
          )
        }
      })()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="clientId">Productor</Label>
          <Select
            value={values.clientId}
            onValueChange={(clientId) =>
              setValues((current) => ({ ...current, clientId }))
            }
            disabled={clients.length === 0 || isPending}
          >
            <SelectTrigger id="clientId">
              <SelectValue
                placeholder={
                  clients.length === 0
                    ? 'No hay productores disponibles'
                    : 'Selecciona un productor'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.fullName} {client.companyName ? `· ${client.companyName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Nombre de la granja</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Ej. Núcleo El Porvenir"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="speciesType">Especie</Label>
          <Select
            value={values.speciesType}
            onValueChange={(speciesType: FarmSpecies) =>
              setValues((current) => ({ ...current, speciesType }))
            }
          >
            <SelectTrigger id="speciesType">
              <SelectValue placeholder="Selecciona la especie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="poultry">Avícola</SelectItem>
              <SelectItem value="swine">Porcino</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Ubicación</Label>
          <Input
            id="location"
            value={values.location}
            onChange={(event) =>
              setValues((current) => ({ ...current, location: event.target.value }))
            }
            placeholder="Municipio, vereda o planta"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="capacity">Capacidad</Label>
          <Input
            id="capacity"
            type="number"
            min="0"
            value={values.capacity}
            onChange={(event) =>
              setValues((current) => ({ ...current, capacity: event.target.value }))
            }
            placeholder="12000"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="assignedAdvisorId">Asesor asignado</Label>
          <AdvisorSelect
            advisors={advisors}
            value={values.assignedAdvisorId}
            onValueChange={(assignedAdvisorId) =>
              setValues((current) => ({
                ...current,
                assignedAdvisorId,
              }))
            }
            disabled={isPending}
            placeholder="Selecciona el asesor responsable"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          {mode === 'create'
            ? 'La granja se vincula al productor seleccionado y queda disponible en el CRM.'
            : 'Los cambios se reflejan en la ficha operativa y las métricas del módulo.'}
        </p>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending || clients.length === 0}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {mode === 'create' ? 'Crear granja' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </form>
  )
}
