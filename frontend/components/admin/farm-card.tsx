import Link from 'next/link'
import { ArrowUpRight, Bird, BriefcaseBusiness, MapPin, PiggyBank, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FarmListItem, getFarmSpeciesLabel } from '@/lib/api/farms'

interface FarmCardProps {
  farm: FarmListItem
}

export function FarmCard({ farm }: FarmCardProps) {
  const SpeciesIcon = farm.speciesType === 'swine' ? PiggyBank : Bird

  return (
    <Card className="overflow-hidden border-primary/10 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl text-foreground">{farm.name}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>{farm.client.fullName}</span>
              <span className="text-border">•</span>
              <span>{farm.client.companyName || 'Operación independiente'}</span>
            </CardDescription>
          </div>
          <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/15">
            <SpeciesIcon className="size-3.5" />
            {getFarmSpeciesLabel(farm.speciesType)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <BriefcaseBusiness className="size-3.5" />
              Capacidad
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {farm.capacity?.toLocaleString('es-CO') || 'N/D'}
            </p>
          </div>
          <div className="rounded-2xl border border-accent/20 bg-accent/10 p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Casos
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{farm._count?.cases ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <MapPin className="size-3.5" />
              Visitas
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{farm._count?.visits ?? 0}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            {farm.location || 'Ubicación pendiente'} {farm.assignedAdvisorId ? `· Asesor ${farm.assignedAdvisorId.slice(0, 8)}` : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" className="h-9 px-3">
              <Link href={`/admin/visits?farmId=${farm.id}&clientId=${farm.clientId}`}>Visitas</Link>
            </Button>
            <Button asChild variant="outline" className="border-primary/20 bg-background/60">
              <Link href={`/admin/farms/${farm.id}`}>
                Abrir ficha
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
