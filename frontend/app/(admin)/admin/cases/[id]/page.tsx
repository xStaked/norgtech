import Link from 'next/link'
import {
  ArrowUpRight,
  ChevronLeft,
  CircleAlert,
  ClipboardList,
  MapPinned,
  NotebookPen,
  Plus,
  UserRoundCog,
} from 'lucide-react'
import { CaseDetailActions } from '@/components/admin/case-detail-actions'
import { CaseStatusBadge } from '@/components/admin/case-status-badge'
import { CaseTimeline } from '@/components/admin/case-timeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCaseNumber } from '@/lib/api/cases'
import { fetchAdvisorOptions } from '../../_lib/server-advisors'
import { fetchCase } from '../_lib/server-cases'

interface CaseDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params
  const [caseRecord, advisors] = await Promise.all([
    fetchCase(id),
    fetchAdvisorOptions(),
  ])

  const assignedAdvisor = advisors.find((advisor) => advisor.id === caseRecord.assignedTechId)

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.08),_transparent_26%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(255,247,237,0.72))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/admin/cases"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              Volver a soporte técnico
            </Link>

            <div className="flex flex-wrap gap-3">
              {caseRecord.farmId ? (
                <Button asChild variant="outline" className="border-primary/20">
                  <Link href={`/admin/visits?clientId=${caseRecord.clientId}&farmId=${caseRecord.farmId}`}>
                    <ArrowUpRight className="size-4" />
                    Ver visitas de la granja
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" className="border-primary/20">
                <Link
                  href={`/admin/visits/new?clientId=${caseRecord.clientId}${caseRecord.farmId ? `&farmId=${caseRecord.farmId}` : ''}&caseId=${caseRecord.id}`}
                >
                  <Plus className="size-4" />
                  Registrar visita
                </Link>
              </Button>
            </div>
          </div>

          <section className="rounded-[2rem] border border-orange-200 bg-card/95 p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  <ClipboardList className="size-3.5" />
                  {formatCaseNumber(caseRecord.caseNumber)}
                </div>

                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                    {caseRecord.title}
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                    {caseRecord.description || 'Sin descripción extendida registrada en este caso.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <CaseStatusBadge type="severity" value={caseRecord.severity} />
                  <CaseStatusBadge type="status" value={caseRecord.status} />
                  <Badge variant="outline" className="border-border/80 bg-muted/30">
                    {caseRecord.client.fullName}
                  </Badge>
                  {caseRecord.farm?.name ? (
                    <Badge variant="outline" className="border-border/80 bg-muted/30">
                      {caseRecord.farm.name}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[340px]">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Apertura</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'full',
                      timeStyle: 'short',
                    }).format(new Date(caseRecord.createdAt))}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Responsable</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {assignedAdvisor?.fullName || assignedAdvisor?.email || 'Sin asignar'}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card className="rounded-[2rem] border-primary/10">
              <CardHeader>
                <CardTitle>Timeline del caso</CardTitle>
              </CardHeader>
              <CardContent>
                <CaseTimeline messages={caseRecord.messages} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle>Contexto del expediente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                  <UserRoundCog className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Productor</p>
                    <p className="text-muted-foreground">
                      {caseRecord.client.fullName}
                      {caseRecord.client.companyName ? ` · ${caseRecord.client.companyName}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                  <MapPinned className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Granja</p>
                    <p className="text-muted-foreground">
                      {caseRecord.farm?.name || 'Sin granja asociada'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                  <NotebookPen className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Mensajes registrados</p>
                    <p className="text-muted-foreground">{caseRecord.messages.length} eventos en timeline</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                  <CircleAlert className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Cierre</p>
                    <p className="text-muted-foreground">
                      {caseRecord.closedAt
                        ? new Intl.DateTimeFormat('es-CO', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(caseRecord.closedAt))
                        : 'Aún abierto'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <CaseDetailActions advisors={advisors} caseRecord={caseRecord} />
          </div>
        </section>
      </div>
    </div>
  )
}
