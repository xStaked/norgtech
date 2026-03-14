import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Bird, CalendarClock, MapPinned, PencilLine, PiggyBank, Plus, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getFarmSpeciesLabel } from '@/lib/api/farms'
import { fetchFarm, fetchFarmStats } from '../_lib/server-farms'

interface FarmDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function FarmDetailPage({ params }: FarmDetailPageProps) {
  const { id } = await params
  const [farm, stats] = await Promise.all([fetchFarm(id), fetchFarmStats(id)])
  const SpeciesIcon = farm.speciesType === 'swine' ? PiggyBank : Bird

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost" className="pl-0">
          <Link href="/admin/farms">
            <ArrowLeft className="size-4" />
            Volver a granjas
          </Link>
        </Button>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="border-primary/20">
            <Link href={`/admin/visits?farmId=${farm.id}&clientId=${farm.clientId}`}>
              <ArrowUpRight className="size-4" />
              Ver visitas
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-primary/20">
            <Link href={`/admin/visits/new?farmId=${farm.id}&clientId=${farm.clientId}`}>
              <Plus className="size-4" />
              Registrar visita
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/farms/${farm.id}/edit`}>
              <PencilLine className="size-4" />
              Editar granja
            </Link>
          </Button>
        </div>
      </div>

      <section className="rounded-[2rem] border border-primary/10 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit gap-1 bg-primary/15 text-primary hover:bg-primary/15">
              <SpeciesIcon className="size-3.5" />
              {getFarmSpeciesLabel(farm.speciesType)}
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">{farm.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {farm.client.fullName} {farm.client.companyName ? `· ${farm.client.companyName}` : ''}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <div className="rounded-2xl border border-primary/10 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Capacidad</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {farm.capacity?.toLocaleString('es-CO') || 'N/D'}
              </p>
            </div>
            <div className="rounded-2xl border border-primary/10 bg-background/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ubicación</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{farm.location || 'Pendiente'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Visitas</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{stats.kpis.totalVisits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Casos totales</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{stats.kpis.totalCases}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Casos abiertos</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{stats.kpis.openCases}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Casos cerrados</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{stats.kpis.closedCases}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle>Historial de visitas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {farm.visits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                Aún no hay visitas registradas para esta granja.
              </div>
            ) : (
              farm.visits.map((visit) => (
                <div key={visit.id} className="rounded-2xl border border-border/70 bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <CalendarClock className="size-4 text-primary" />
                      {new Date(visit.visitDate).toLocaleDateString('es-CO', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Asesor {visit.advisorId.slice(0, 8)}</Badge>
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                        <Link href={`/admin/visits/${visit.id}`}>
                          Ver detalle
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {visit.observations || 'Sin observaciones registradas.'}
                  </p>
                  {visit.recommendations ? (
                    <p className="mt-2 text-sm text-foreground">
                      Recomendaciones: {visit.recommendations}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contexto operativo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <MapPinned className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Ubicación</p>
                  <p className="text-muted-foreground">{farm.location || 'Sin ubicación registrada'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <ShieldAlert className="mt-0.5 size-4 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Última visita</p>
                  <p className="text-muted-foreground">
                    {stats.lastVisit
                      ? new Date(stats.lastVisit.visitDate).toLocaleDateString('es-CO')
                      : 'Aún no se han registrado visitas'}
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full border-primary/20">
                <Link href={`/admin/visits?farmId=${farm.id}&clientId=${farm.clientId}`}>
                  Ir al historial técnico
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Productor asociado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-lg font-medium text-foreground">{farm.client.fullName}</p>
              <p className="text-muted-foreground">
                {farm.client.companyName || 'Sin razón social registrada'}
              </p>
              <p className="text-muted-foreground">{farm.client.email || 'Sin correo registrado'}</p>
              <p className="text-muted-foreground">{farm.client.phone || 'Sin teléfono registrado'}</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
