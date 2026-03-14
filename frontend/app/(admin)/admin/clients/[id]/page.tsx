import Link from 'next/link'
import { ArrowUpRight, ChevronLeft, FileText, MapPin, PencilLine, Plus, Sprout } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  getClientStatusLabel,
  getSpeciesLabel,
} from '@/lib/api/clients'
import { fetchClient, fetchClientSummary } from '../_lib/server-clients'

interface ClientDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params
  const [client, summary] = await Promise.all([
    fetchClient(id),
    fetchClientSummary(id),
  ])

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.08),_transparent_26%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(240,253,244,0.8))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <Link
              href="/admin/clients"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              Volver al CRM
            </Link>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  {client.fullName}
                </h1>
                <Badge
                  variant={client.status === 'inactive' ? 'secondary' : 'default'}
                  className={client.status === 'inactive' ? '' : 'bg-primary/15 text-primary hover:bg-primary/15'}
                >
                  {getClientStatusLabel(client.status)}
                </Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {client.companyName || 'Productor independiente'} · {client.email || 'Sin correo'} ·{' '}
                {client.phone || 'Sin teléfono'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="border-primary/20">
              <Link href={`/admin/visits?clientId=${client.id}`}>
                <ArrowUpRight className="size-4" />
                Ver visitas
              </Link>
            </Button>
            <Button asChild variant="outline" className="border-primary/20">
              <Link href={`/admin/visits/new?clientId=${client.id}`}>
                <Plus className="size-4" />
                Registrar visita
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/admin/clients/${client.id}/edit`}>
                <PencilLine className="size-4" />
                Editar productor
              </Link>
            </Button>
          </div>
        </div>

        <section className="grid gap-4 lg:grid-cols-4">
          <Card className="border-primary/10 bg-primary/5">
            <CardHeader className="pb-3">
              <CardDescription>Granjas activas</CardDescription>
              <CardTitle>{summary.metrics.farms}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-accent/20 bg-accent/10">
            <CardHeader className="pb-3">
              <CardDescription>Casos abiertos</CardDescription>
              <CardTitle>{summary.metrics.openCases}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Casos totales</CardDescription>
              <CardTitle>{summary.metrics.totalCases}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Visitas registradas</CardDescription>
              <CardTitle>{summary.metrics.totalVisits}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
          <Card className="rounded-[2rem]">
            <CardHeader>
              <CardTitle>Granjas asociadas</CardTitle>
              <CardDescription>
                Relación operativa del productor con foco en especie y capacidad.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.farms.length > 0 ? (
                client.farms.map((farm) => (
                  <div
                    key={farm.id}
                    className="rounded-2xl border border-border bg-muted/30 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Sprout className="size-4 text-primary" />
                          <p className="font-medium text-foreground">{farm.name}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {farm.location || 'Ubicación no registrada'}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-primary/20 bg-primary/5">
                        {getSpeciesLabel(farm.speciesType)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Capacidad: {farm.capacity ? farm.capacity.toLocaleString('es-CO') : 'Sin dato'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                        <Link href={`/admin/farms/${farm.id}`}>Abrir granja</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                        <Link href={`/admin/visits?clientId=${client.id}&farmId=${farm.id}`}>
                          Ver visitas
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Este productor todavía no tiene granjas registradas.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle>Resumen operativo</CardTitle>
                <CardDescription>Datos clave para el equipo comercial y técnico.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="font-medium text-foreground">Dirección</p>
                  <p className="mt-1">{client.address || 'Sin dirección registrada'}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="font-medium text-foreground">Asesor asignado</p>
                  <p className="mt-1">{client.assignedAdvisorId || 'Pendiente de asignación'}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="font-medium text-foreground">Última visita</p>
                  <p className="mt-1">
                    {summary.lastVisit
                      ? new Intl.DateTimeFormat('es-CO', {
                          dateStyle: 'medium',
                        }).format(new Date(summary.lastVisit.visitDate))
                      : 'Sin visitas registradas'}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="font-medium text-foreground">Notas</p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {client.notes || 'Sin notas registradas.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle>Casos recientes</CardTitle>
                <CardDescription>Últimos tickets asociados al productor.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {client.cases.length > 0 ? (
                  client.cases.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-border bg-muted/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <FileText className="size-4 text-primary" />
                            <p className="font-medium text-foreground">{item.title}</p>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Caso #{item.caseNumber} · {item.severity}
                          </p>
                        </div>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <div className="mt-3">
                        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                          <Link href={`/admin/visits/new?clientId=${client.id}&caseId=${item.id}`}>
                            Registrar visita sobre este caso
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    No hay casos asociados todavía.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[2rem]">
              <CardHeader>
                <CardTitle>Mix productivo</CardTitle>
                <CardDescription>Distribución por especie.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.speciesBreakdown.length > 0 ? (
                  summary.speciesBreakdown.map((item) => (
                    <div
                      key={item.speciesType}
                      className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <MapPin className="size-4 text-primary" />
                        {getSpeciesLabel(item.speciesType)}
                      </div>
                      <Badge variant="outline">{item.count}</Badge>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    El productor aún no tiene mix productivo definido.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  )
}
