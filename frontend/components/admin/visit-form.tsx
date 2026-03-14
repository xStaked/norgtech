'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Loader2, Save } from 'lucide-react'
import type { AdvisorOption } from '@/lib/admin/advisors'
import type { CaseListItem } from '@/lib/api/cases'
import type { ClientListItem } from '@/lib/api/clients'
import type { FarmListItem } from '@/lib/api/farms'
import {
  createVisitRecord,
  getVisitSpeciesLabel,
  updateVisitRecord,
  type VisitDetail,
  type VisitPayload,
} from '@/lib/api/visits'
import { AdvisorSelect } from '@/components/admin/advisor-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface VisitFormProps {
  advisors: AdvisorOption[]
  clients: ClientListItem[]
  farms: FarmListItem[]
  cases: CaseListItem[]
  mode: 'create' | 'edit'
  visit?: VisitDetail
  initialValues?: Partial<Pick<VisitFormState, 'caseId' | 'clientId' | 'farmId' | 'advisorId' | 'visitDate'>>
}

interface VisitFormState {
  caseId: string
  clientId: string
  farmId: string
  advisorId: string
  visitDate: string
  birdCount: string
  mortalityCount: string
  feedConversion: string
  avgBodyWeight: string
  animalCount: string
  dailyWeightGain: string
  feedConsumption: string
  observations: string
  recommendations: string
}

function toDateTimeLocal(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function toInitialState(visit?: VisitDetail): VisitFormState {
  return {
    caseId: visit?.caseId ?? '',
    clientId: visit?.clientId ?? '',
    farmId: visit?.farmId ?? '',
    advisorId: visit?.advisorId ?? '',
    visitDate: visit?.visitDate ? toDateTimeLocal(visit.visitDate) : '',
    birdCount: visit?.birdCount !== null && visit?.birdCount !== undefined ? String(visit.birdCount) : '',
    mortalityCount:
      visit?.mortalityCount !== null && visit?.mortalityCount !== undefined
        ? String(visit.mortalityCount)
        : '',
    feedConversion:
      visit?.feedConversion !== null && visit?.feedConversion !== undefined
        ? String(visit.feedConversion)
        : '',
    avgBodyWeight:
      visit?.avgBodyWeight !== null && visit?.avgBodyWeight !== undefined
        ? String(visit.avgBodyWeight)
        : '',
    animalCount:
      visit?.animalCount !== null && visit?.animalCount !== undefined
        ? String(visit.animalCount)
        : '',
    dailyWeightGain:
      visit?.dailyWeightGain !== null && visit?.dailyWeightGain !== undefined
        ? String(visit.dailyWeightGain)
        : '',
    feedConsumption:
      visit?.feedConsumption !== null && visit?.feedConsumption !== undefined
        ? String(visit.feedConsumption)
        : '',
    observations: visit?.observations ?? '',
    recommendations: visit?.recommendations ?? '',
  }
}

function toOptionalNumber(value: string) {
  const normalized = value.trim()
  return normalized ? Number(normalized) : undefined
}

export function VisitForm({
  advisors,
  clients,
  farms,
  cases,
  mode,
  visit,
  initialValues,
}: VisitFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<VisitFormState>(() => ({
    ...toInitialState(visit),
    ...initialValues,
  }))
  const [error, setError] = useState<string | null>(null)

  const selectedFarm = farms.find((farm) => farm.id === values.farmId)
  const availableFarms = useMemo(
    () => farms.filter((farm) => !values.clientId || farm.clientId === values.clientId),
    [farms, values.clientId],
  )
  const availableCases = useMemo(
    () =>
      cases.filter((caseRecord) => {
        if (values.clientId && caseRecord.clientId !== values.clientId) {
          return false
        }

        if (values.farmId && caseRecord.farmId && caseRecord.farmId !== values.farmId) {
          return false
        }

        return true
      }),
    [cases, values.clientId, values.farmId],
  )

  const isSwine = selectedFarm?.speciesType === 'swine'

  const updateValue = <K extends keyof VisitFormState>(key: K, value: VisitFormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const normalizePayload = (): VisitPayload => ({
    caseId: values.caseId || undefined,
    clientId: values.clientId,
    farmId: values.farmId,
    advisorId: values.advisorId,
    visitDate: new Date(values.visitDate).toISOString(),
    birdCount: !isSwine ? toOptionalNumber(values.birdCount) : undefined,
    mortalityCount: !isSwine ? toOptionalNumber(values.mortalityCount) : undefined,
    feedConversion: !isSwine ? toOptionalNumber(values.feedConversion) : undefined,
    avgBodyWeight: !isSwine ? toOptionalNumber(values.avgBodyWeight) : undefined,
    animalCount: isSwine ? toOptionalNumber(values.animalCount) : undefined,
    dailyWeightGain: isSwine ? toOptionalNumber(values.dailyWeightGain) : undefined,
    feedConsumption: isSwine ? toOptionalNumber(values.feedConsumption) : undefined,
    observations: values.observations.trim() || undefined,
    recommendations: values.recommendations.trim() || undefined,
  })

  const handleClientChange = (clientId: string) => {
    setValues((current) => {
      const nextFarmStillValid = farms.some(
        (farm) => farm.id === current.farmId && farm.clientId === clientId,
      )
      const nextCaseStillValid = cases.some(
        (caseRecord) =>
          caseRecord.id === current.caseId &&
          caseRecord.clientId === clientId &&
          (!current.farmId || !caseRecord.farmId || caseRecord.farmId === current.farmId),
      )

      return {
        ...current,
        clientId,
        farmId: nextFarmStillValid ? current.farmId : '',
        caseId: nextCaseStillValid ? current.caseId : '',
      }
    })
  }

  const handleFarmChange = (farmId: string) => {
    setValues((current) => {
      const farm = farms.find((item) => item.id === farmId)
      const nextClientId = farm?.clientId ?? current.clientId
      const nextCaseStillValid = cases.some(
        (caseRecord) =>
          caseRecord.id === current.caseId &&
          caseRecord.clientId === nextClientId &&
          (!caseRecord.farmId || caseRecord.farmId === farmId),
      )

      return {
        ...current,
        clientId: nextClientId,
        farmId,
        caseId: nextCaseStillValid ? current.caseId : '',
      }
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!values.clientId) {
      setError('Debes seleccionar un productor.')
      return
    }

    if (!values.farmId) {
      setError('Debes seleccionar una granja.')
      return
    }

    if (!values.advisorId) {
      setError('Debes seleccionar el asesor responsable.')
      return
    }

    if (!values.visitDate) {
      setError('La fecha de la visita es obligatoria.')
      return
    }

    startTransition(() => {
      void (async () => {
        try {
          const payload = normalizePayload()
          const response =
            mode === 'create'
              ? await createVisitRecord(payload)
              : await updateVisitRecord(visit!.id, payload)

          router.push(`/admin/visits/${response.id}`)
          router.refresh()
        } catch (submitError) {
          setError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo guardar la visita.',
          )
        }
      })()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="clientId">Productor</Label>
          <Select value={values.clientId} onValueChange={handleClientChange} disabled={isPending}>
            <SelectTrigger id="clientId">
              <SelectValue placeholder="Selecciona el productor" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.fullName}
                  {client.companyName ? ` · ${client.companyName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="farmId">Granja</Label>
          <Select value={values.farmId} onValueChange={handleFarmChange} disabled={isPending}>
            <SelectTrigger id="farmId">
              <SelectValue placeholder="Selecciona la granja" />
            </SelectTrigger>
            <SelectContent>
              {availableFarms.map((farm) => (
                <SelectItem key={farm.id} value={farm.id}>
                  {farm.name} · {getVisitSpeciesLabel(farm.speciesType)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="advisorId">Asesor responsable</Label>
          <AdvisorSelect
            advisors={advisors}
            value={values.advisorId}
            onValueChange={(value) => updateValue('advisorId', value)}
            disabled={isPending}
            placeholder="Selecciona el asesor que realizó la visita"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="visitDate">Fecha y hora</Label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="visitDate"
              type="datetime-local"
              className="pl-9"
              value={values.visitDate}
              onChange={(event) => updateValue('visitDate', event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="caseId">Caso relacionado</Label>
          <Select value={values.caseId || 'none'} onValueChange={(value) => updateValue('caseId', value === 'none' ? '' : value)}>
            <SelectTrigger id="caseId">
              <SelectValue placeholder="Sin caso asociado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin caso asociado</SelectItem>
              {availableCases.map((caseRecord) => (
                <SelectItem key={caseRecord.id} value={caseRecord.id}>
                  {`CASO-${String(caseRecord.caseNumber).padStart(4, '0')} · ${caseRecord.title}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="rounded-[1.75rem] border border-primary/10 bg-primary/5 p-5">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Indicadores productivos</h2>
          <p className="text-sm text-muted-foreground">
            {selectedFarm
              ? `Campos activos para operación ${getVisitSpeciesLabel(selectedFarm.speciesType).toLowerCase()}.`
              : 'Selecciona primero una granja para habilitar los indicadores específicos.'}
          </p>
        </div>

        {isSwine ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="animalCount">Cantidad de animales</Label>
              <Input
                id="animalCount"
                type="number"
                min="0"
                value={values.animalCount}
                onChange={(event) => updateValue('animalCount', event.target.value)}
                placeholder="820"
                disabled={!selectedFarm}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailyWeightGain">Ganancia diaria de peso (kg)</Label>
              <Input
                id="dailyWeightGain"
                type="number"
                min="0"
                step="0.01"
                value={values.dailyWeightGain}
                onChange={(event) => updateValue('dailyWeightGain', event.target.value)}
                placeholder="0.86"
                disabled={!selectedFarm}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedConsumption">Consumo de alimento (kg)</Label>
              <Input
                id="feedConsumption"
                type="number"
                min="0"
                step="0.01"
                value={values.feedConsumption}
                onChange={(event) => updateValue('feedConsumption', event.target.value)}
                placeholder="2.1"
                disabled={!selectedFarm}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="birdCount">Cantidad de aves</Label>
              <Input
                id="birdCount"
                type="number"
                min="0"
                value={values.birdCount}
                onChange={(event) => updateValue('birdCount', event.target.value)}
                placeholder="12000"
                disabled={!selectedFarm}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mortalityCount">Mortalidad</Label>
              <Input
                id="mortalityCount"
                type="number"
                min="0"
                value={values.mortalityCount}
                onChange={(event) => updateValue('mortalityCount', event.target.value)}
                placeholder="135"
                disabled={!selectedFarm}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedConversion">Conversión alimenticia</Label>
              <Input
                id="feedConversion"
                type="number"
                min="0"
                step="0.01"
                value={values.feedConversion}
                onChange={(event) => updateValue('feedConversion', event.target.value)}
                placeholder="1.72"
                disabled={!selectedFarm}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avgBodyWeight">Peso promedio (kg)</Label>
              <Input
                id="avgBodyWeight"
                type="number"
                min="0"
                step="0.01"
                value={values.avgBodyWeight}
                onChange={(event) => updateValue('avgBodyWeight', event.target.value)}
                placeholder="2.31"
                disabled={!selectedFarm}
              />
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="observations">Observaciones</Label>
          <Textarea
            id="observations"
            className="min-h-36"
            value={values.observations}
            onChange={(event) => updateValue('observations', event.target.value)}
            placeholder="Hallazgos de campo, validación del protocolo, ambiente, consumo o comportamiento."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recommendations">Recomendaciones</Label>
          <Textarea
            id="recommendations"
            className="min-h-36"
            value={values.recommendations}
            onChange={(event) => updateValue('recommendations', event.target.value)}
            placeholder="Acciones acordadas, ajustes operativos y siguiente visita sugerida."
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-card px-4 py-4">
        <p className="text-sm text-muted-foreground">
          {mode === 'create'
            ? 'La visita quedará disponible en la ficha de la granja, el productor y el historial técnico.'
            : 'Los cambios actualizan el expediente de campo y los indicadores productivos relacionados.'}
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {mode === 'create' ? 'Registrar visita' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </form>
  )
}
