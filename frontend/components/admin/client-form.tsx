'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState, useTransition } from 'react'
import { Loader2, Save } from 'lucide-react'
import type { AdvisorOption } from '@/lib/admin/advisors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AdvisorSelect } from '@/components/admin/advisor-select'
import {
  ClientDetail,
  ClientPayload,
  createClientRecord,
  updateClientRecord,
} from '@/lib/api/clients'

interface ClientFormProps {
  advisors: AdvisorOption[]
  mode: 'create' | 'edit'
  client?: ClientDetail
}

interface ClientFormState {
  fullName: string
  phone: string
  email: string
  companyName: string
  address: string
  assignedAdvisorId: string
  notes: string
}

function toInitialState(client?: ClientDetail): ClientFormState {
  return {
    fullName: client?.fullName ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    companyName: client?.companyName ?? '',
    address: client?.address ?? '',
    assignedAdvisorId: client?.assignedAdvisorId ?? '',
    notes: client?.notes ?? '',
  }
}

function normalizePayload(values: ClientFormState): ClientPayload {
  return {
    fullName: values.fullName.trim(),
    phone: values.phone.trim() || undefined,
    email: values.email.trim() || undefined,
    companyName: values.companyName.trim() || undefined,
    address: values.address.trim() || undefined,
    assignedAdvisorId: values.assignedAdvisorId.trim() || undefined,
    notes: values.notes.trim() || undefined,
  }
}

export function ClientForm({ advisors, mode, client }: ClientFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<ClientFormState>(() => toInitialState(client))
  const [error, setError] = useState<string | null>(null)

  const submitLabel = mode === 'create' ? 'Crear productor' : 'Guardar cambios'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!values.fullName.trim()) {
      setError('El nombre del productor es obligatorio.')
      return
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = normalizePayload(values)
          const response =
            mode === 'create'
              ? await createClientRecord(payload)
              : await updateClientRecord(client!.id, payload)

          router.push(`/admin/clients/${response.id}`)
          router.refresh()
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo guardar el productor.',
          )
        }
      })()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input
            id="fullName"
            value={values.fullName}
            onChange={(event) =>
              setValues((current) => ({ ...current, fullName: event.target.value }))
            }
            placeholder="Ej. Granja Avícola San Miguel"
            autoComplete="name"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="companyName">Empresa o razón social</Label>
          <Input
            id="companyName"
            value={values.companyName}
            onChange={(event) =>
              setValues((current) => ({ ...current, companyName: event.target.value }))
            }
            placeholder="Integración Los Cedros"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input
            id="phone"
            value={values.phone}
            onChange={(event) =>
              setValues((current) => ({ ...current, phone: event.target.value }))
            }
            placeholder="+57 300 000 0000"
            autoComplete="tel"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(event) =>
              setValues((current) => ({ ...current, email: event.target.value }))
            }
            placeholder="contacto@norgtech.co"
            autoComplete="email"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="address">Dirección</Label>
          <Input
            id="address"
            value={values.address}
            onChange={(event) =>
              setValues((current) => ({ ...current, address: event.target.value }))
            }
            placeholder="Municipio, vereda o referencia comercial"
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
            placeholder="Selecciona el responsable comercial o técnico"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas comerciales y técnicas</Label>
        <Textarea
          id="notes"
          value={values.notes}
          onChange={(event) =>
            setValues((current) => ({ ...current, notes: event.target.value }))
          }
          placeholder="Observaciones, condiciones productivas, alertas o acuerdos recientes."
          className="min-h-36"
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
            ? 'El productor quedará disponible de inmediato en el CRM interno.'
            : 'Los cambios se reflejan en el perfil del productor y sus listados.'}
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
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
