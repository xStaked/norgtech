import Link from 'next/link'
import { ChevronLeft, ClipboardList, Factory, MapPin, UserRoundCog } from 'lucide-react'
import { VisitForm } from '@/components/admin/visit-form'
import { VisitSummaryCard } from '@/components/admin/visit-summary-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchCases } from '../../cases/_lib/server-cases'
import { fetchClients } from '../../clients/_lib/server-clients'
import { fetchFarms } from '../../farms/_lib/server-farms'
import { fetchAdvisorOptions } from '../../_lib/server-advisors'
import { fetchVisit } from '../_lib/server-visits'

interface VisitDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function VisitDetailPage({ params }: VisitDetailPageProps) {
  const { id } = await params
  const [visit, advisors, clients, farms, cases] = await Promise.all([
    fetchVisit(id),
    fetchAdvisorOptions(),
    fetchClients({ limit: 100, status: 'active' }),
    fetchFarms(),
    fetchCases({ limit: 100 }),
  ])

  const advisor = advisors.find((item) => item.id === visit.advisorId)

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.08),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(240,253,244,0.72))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Link
          href="/admin/visits"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Volver a visitas
        </Link>

        <VisitSummaryCard visit={visit} />

        <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle>Contexto de la visita</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                <UserRoundCog className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Asesor responsable</p>
                  <p className="text-muted-foreground">
                    {advisor?.fullName || advisor?.email || visit.advisorId}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                <Factory className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Productor</p>
                  <p className="text-muted-foreground">
                    {visit.client.fullName}
                    {visit.client.companyName ? ` · ${visit.client.companyName}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                <MapPin className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Granja</p>
                  <p className="text-muted-foreground">
                    {visit.farm.name}
                    {visit.farm.location ? ` · ${visit.farm.location}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4">
                <ClipboardList className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Caso asociado</p>
                  <p className="text-muted-foreground">
                    {visit.case ? `CASO-${String(visit.case.caseNumber).padStart(4, '0')} · ${visit.case.title}` : 'Sin caso asociado'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fecha de registro</p>
                <p className="mt-2 font-medium text-foreground">
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'full',
                    timeStyle: 'short',
                  }).format(new Date(visit.createdAt))}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-border/80 bg-muted/30">
                  {visit.farm.speciesType === 'swine' ? 'Operación porcina' : 'Operación avícola'}
                </Badge>
                {visit.case ? (
                  <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                    {visit.case.status}
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-primary/10">
            <CardHeader>
              <CardTitle>Editar visita</CardTitle>
            </CardHeader>
            <CardContent>
              <VisitForm
                advisors={advisors}
                clients={clients.items}
                farms={farms.items}
                cases={cases.items}
                mode="edit"
                visit={visit}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
