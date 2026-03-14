import Link from 'next/link'
import { ArrowLeft, ClipboardList, MapPinned, TestTubeDiagonal } from 'lucide-react'
import { CaseStatusBadge } from '@/components/admin/case-status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CaseStatusTimeline } from '@/components/portal/case-status-timeline'
import { formatCaseNumber } from '@/lib/api/cases'
import { fetchPortalCase } from '@/app/(portal)/portal/_lib/server-portal'

interface PortalCaseDetailViewProps {
  id: string
}

export async function PortalCaseDetailView({ id }: PortalCaseDetailViewProps) {
  const caseRecord = await fetchPortalCase(id)

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          href="/portal/cases"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a casos
        </Link>

        <section className="rounded-[2rem] border border-primary/10 bg-white/90 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                  {formatCaseNumber(caseRecord.caseNumber)}
                </Badge>
                <CaseStatusBadge type="severity" value={caseRecord.severity} />
                <CaseStatusBadge type="status" value={caseRecord.status} />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  {caseRecord.title}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {caseRecord.description || 'Este caso no tiene una descripción adicional visible.'}
                </p>
              </div>
            </div>

            <div className="grid min-w-[250px] gap-3">
              <div className="rounded-[1.5rem] bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-primary/70">Apertura</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  }).format(new Date(caseRecord.createdAt))}
                </p>
              </div>
              <div className="rounded-[1.5rem] bg-orange-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-orange-700">Granja</p>
                <p className="mt-2 text-sm font-semibold text-orange-950">
                  {caseRecord.farm?.name || 'Sin granja asociada'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[2rem] border-primary/10 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Historial del caso</CardTitle>
          </CardHeader>
          <CardContent>
            <CaseStatusTimeline messages={caseRecord.messages} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border-primary/10 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle>Resumen visible</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3 rounded-[1.5rem] bg-muted/20 p-4">
                <ClipboardList className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Estado actual</p>
                  <p className="text-muted-foreground">
                    {caseRecord.status === 'waiting_client'
                      ? 'Este caso requiere una acción o información pendiente de tu parte.'
                      : 'El equipo técnico sigue gestionando este caso y reflejará aquí sus avances.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-[1.5rem] bg-muted/20 p-4">
                <MapPinned className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Ubicación operativa</p>
                  <p className="text-muted-foreground">
                    {caseRecord.farm?.location || 'Sin ubicación registrada para esta granja.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-[1.5rem] bg-muted/20 p-4">
                <TestTubeDiagonal className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Visitas relacionadas</p>
                  <p className="text-muted-foreground">
                    {caseRecord.visits?.length
                      ? `${caseRecord.visits.length} visitas registradas sobre este caso.`
                      : 'Todavía no hay visitas registradas directamente sobre este caso.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-primary/10 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle>Visitas asociadas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {caseRecord.visits?.length ? (
                caseRecord.visits.map((visit) => (
                  <div key={visit.id} className="rounded-[1.5rem] border border-border bg-background p-4">
                    <p className="text-sm font-medium text-foreground">
                      {new Intl.DateTimeFormat('es-CO', {
                        dateStyle: 'medium',
                      }).format(new Date(visit.visitDate))}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {visit.observations || 'Sin observaciones visibles.'}
                    </p>
                    {visit.recommendations ? (
                      <p className="mt-2 text-sm leading-6 text-foreground">
                        Recomendaciones: {visit.recommendations}
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
                  Este caso no tiene visitas vinculadas todavía.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
