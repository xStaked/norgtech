'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquarePlus, Save } from 'lucide-react'
import type { AdvisorOption } from '@/lib/admin/advisors'
import type { CaseDetail, CaseSeverity, CaseStatus } from '@/lib/api/cases'
import { addCaseMessage, updateCaseRecord } from '@/lib/api/cases'
import { AdvisorSelect } from '@/components/admin/advisor-select'
import { SeveritySelector } from '@/components/admin/severity-selector'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getCaseStatusLabel } from '@/lib/api/cases'

const STATUS_OPTIONS: CaseStatus[] = [
  'open',
  'in_analysis',
  'treatment',
  'waiting_client',
  'closed',
]

interface CaseDetailActionsProps {
  advisors: AdvisorOption[]
  caseRecord: CaseDetail
}

export function CaseDetailActions({
  advisors,
  caseRecord,
}: CaseDetailActionsProps) {
  const router = useRouter()
  const [isUpdating, startUpdateTransition] = useTransition()
  const [isMessaging, startMessageTransition] = useTransition()
  const [status, setStatus] = useState<CaseStatus>(
    (caseRecord.status as CaseStatus) ?? 'open',
  )
  const [severity, setSeverity] = useState<CaseSeverity>(
    (caseRecord.severity as CaseSeverity) ?? 'medium',
  )
  const [assignedTechId, setAssignedTechId] = useState(caseRecord.assignedTechId ?? '')
  const [statusNote, setStatusNote] = useState('')
  const [message, setMessage] = useState('')
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)

  const handleUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setUpdateError(null)

    startUpdateTransition(() => {
      void (async () => {
        try {
          await updateCaseRecord(caseRecord.id, {
            status,
            severity,
            assignedTechId: assignedTechId || undefined,
            note: statusNote.trim() || undefined,
          })

          setStatusNote('')
          router.refresh()
        } catch (submitError) {
          setUpdateError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo actualizar el caso.',
          )
        }
      })()
    })
  }

  const handleMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessageError(null)

    if (!message.trim()) {
      setMessageError('La nota interna no puede estar vacía.')
      return
    }

    startMessageTransition(() => {
      void (async () => {
        try {
          await addCaseMessage(caseRecord.id, {
            content: message.trim(),
            messageType: 'note',
          })

          setMessage('')
          router.refresh()
        } catch (submitError) {
          setMessageError(
            submitError instanceof Error
              ? submitError.message
              : 'No se pudo registrar la nota interna.',
          )
        }
      })()
    })
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleUpdate}
        className="rounded-[1.75rem] border border-primary/10 bg-card p-5 shadow-sm"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Actualizar seguimiento</h2>
          <p className="text-sm text-muted-foreground">
            Ajusta estado, severidad y responsable sin salir del expediente.
          </p>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="case-status">Estado</Label>
            <Select value={status} onValueChange={(nextValue: CaseStatus) => setStatus(nextValue)}>
              <SelectTrigger id="case-status">
                <SelectValue placeholder="Selecciona el estado" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {getCaseStatusLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="severity">Severidad</Label>
            <SeveritySelector
              value={severity}
              onValueChange={setSeverity}
              disabled={isUpdating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignedTechId">Técnico asignado</Label>
            <AdvisorSelect
              advisors={advisors}
              value={assignedTechId}
              onValueChange={setAssignedTechId}
              disabled={isUpdating}
              placeholder="Selecciona un responsable"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="statusNote">Nota de cambio</Label>
            <Textarea
              id="statusNote"
              value={statusNote}
              onChange={(event) => setStatusNote(event.target.value)}
              placeholder="Contexto del ajuste, decisiones tomadas o siguiente paso."
              className="min-h-24"
            />
          </div>
        </div>

        {updateError ? (
          <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {updateError}
          </div>
        ) : null}

        <Button type="submit" className="mt-5 w-full" disabled={isUpdating}>
          {isUpdating ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar seguimiento
        </Button>
      </form>

      <form
        onSubmit={handleMessage}
        className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Añadir nota interna</h2>
          <p className="text-sm text-muted-foreground">
            Deja evidencia del análisis, llamadas, laboratorio o recomendaciones previas.
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <Label htmlFor="case-message">Nota</Label>
          <Textarea
            id="case-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Registra observaciones técnicas, acuerdos con el cliente o hallazgos de seguimiento."
            className="min-h-32"
          />
        </div>

        {messageError ? (
          <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {messageError}
          </div>
        ) : null}

        <Button type="submit" variant="outline" className="mt-5 w-full" disabled={isMessaging}>
          {isMessaging ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="size-4" />
          )}
          Registrar nota
        </Button>
      </form>
    </div>
  )
}
