'use client'

import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import type { AdvisorOption } from '@/lib/admin/advisors'
import type { ClientListItem } from '@/lib/api/clients'
import type { FarmListItem } from '@/lib/api/farms'
import type { CaseDetail, CasePayload, CaseSeverity } from '@/lib/api/cases'
import { createCaseRecord, updateCaseRecord } from '@/lib/api/cases'
import { AdvisorSelect } from '@/components/admin/advisor-select'
import { SeveritySelector } from '@/components/admin/severity-selector'
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
import { Textarea } from '@/components/ui/textarea'

const NO_FARM_VALUE = '__no_farm__'

interface CaseFormProps {
  advisors: AdvisorOption[]
  clients: ClientListItem[]
  farms: FarmListItem[]
  mode: 'create' | 'edit'
  caseRecord?: CaseDetail
}

interface CaseFormState {
  clientId: string
  farmId: string
  title: string
  description: string
  severity: CaseSeverity
  assignedTechId: string
}

function toInitialState(caseRecord?: CaseDetail): CaseFormState {
  return {
    clientId: caseRecord?.clientId ?? '',
    farmId: caseRecord?.farmId ?? '',
    title: caseRecord?.title ?? '',
    description: caseRecord?.description ?? '',
    severity: (caseRecord?.severity as CaseSeverity) ?? 'medium',
    assignedTechId: caseRecord?.assignedTechId ?? '',
  }
}

function normalizePayload(values: CaseFormState): CasePayload {
  return {
    clientId: values.clientId,
    farmId: values.farmId || undefined,
    title: values.title.trim(),
    description: values.description.trim() || undefined,
    severity: values.severity,
    assignedTechId: values.assignedTechId.trim() || undefined,
  }
}

export function CaseForm({
  advisors,
  clients,
  farms,
  mode,
  caseRecord,
}: CaseFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<CaseFormState>(() => toInitialState(caseRecord))
  const [error, setError] = useState<string | null>(null)

  const visibleFarms = useMemo(
    () => farms.filter((farm) => !values.clientId || farm.clientId === values.clientId),
    [farms, values.clientId],
  )

  useEffect(() => {
    if (
      values.farmId &&
      !visibleFarms.some((farm) => farm.id === values.farmId)
    ) {
      setValues((current) => ({ ...current, farmId: '' }))
    }
  }, [values.farmId, visibleFarms])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!values.clientId) {
      setError('Debes seleccionar un productor antes de crear el caso.')
      return
    }

    if (!values.title.trim()) {
      setError('El título del caso es obligatorio.')
      return
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = normalizePayload(values)
          const response =
            mode === 'create'
              ? await createCaseRecord(payload)
              : await updateCaseRecord(caseRecord!.id, payload)

          router.push(`/admin/cases/${response.id}`)
          router.refresh()
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo guardar el caso técnico.',
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
            disabled={isPending || clients.length === 0}
          >
            <SelectTrigger id="clientId">
              <SelectValue
                placeholder={
                  clients.length === 0
                    ? 'No hay productores activos disponibles'
                    : 'Selecciona el productor afectado'
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
          <Label htmlFor="farmId">Granja</Label>
          <Select
            value={values.farmId || NO_FARM_VALUE}
            onValueChange={(farmId) =>
              setValues((current) => ({
                ...current,
                farmId: farmId === NO_FARM_VALUE ? '' : farmId,
              }))
            }
            disabled={isPending || visibleFarms.length === 0}
          >
            <SelectTrigger id="farmId">
              <SelectValue
                placeholder={
                  values.clientId
                    ? 'Selecciona una granja asociada'
                    : 'Selecciona primero un productor'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FARM_VALUE}>Sin granja asociada</SelectItem>
              {visibleFarms.map((farm) => (
                <SelectItem key={farm.id} value={farm.id}>
                  {farm.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="severity">Severidad</Label>
          <SeveritySelector
            value={values.severity}
            onValueChange={(severity) =>
              setValues((current) => ({ ...current, severity }))
            }
            disabled={isPending}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="title">Título del caso</Label>
          <Input
            id="title"
            value={values.title}
            onChange={(event) =>
              setValues((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="Ej. Mortalidad elevada en lote 12"
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="assignedTechId">Técnico asignado</Label>
          <AdvisorSelect
            advisors={advisors}
            value={values.assignedTechId}
            onValueChange={(assignedTechId) =>
              setValues((current) => ({
                ...current,
                assignedTechId,
              }))
            }
            disabled={isPending}
            placeholder="Selecciona el técnico responsable"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción del caso</Label>
        <Textarea
          id="description"
          value={values.description}
          onChange={(event) =>
            setValues((current) => ({ ...current, description: event.target.value }))
          }
          placeholder="Resume síntomas, contexto productivo, hallazgos iniciales y cualquier dato relevante para el análisis."
          className="min-h-40"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          {mode === 'create'
            ? 'El caso quedará visible para el equipo técnico con timeline inicial y seguimiento operativo.'
            : 'Los cambios actualizan la ficha del caso y el tablero de soporte técnico.'}
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
            {mode === 'create' ? 'Crear caso' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </form>
  )
}
