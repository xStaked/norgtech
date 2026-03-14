import Link from 'next/link'
import { ArrowUpRight, Building2, FileText, Leaf, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ClientListItem,
  getClientStatusLabel,
  getSpeciesLabel,
} from '@/lib/api/clients'

interface ClientCardProps {
  client: ClientListItem
}

export function ClientCard({ client }: ClientCardProps) {
  return (
    <Card className="border-primary/10 bg-card/90 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl text-foreground">{client.fullName}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2 text-sm">
              <span>{client.companyName || 'Productor independiente'}</span>
              <span className="text-border">•</span>
              <span>{client.email || 'Sin correo registrado'}</span>
            </CardDescription>
          </div>
          <Badge
            variant={client.status === 'inactive' ? 'secondary' : 'default'}
            className={client.status === 'inactive' ? '' : 'bg-primary/15 text-primary hover:bg-primary/15'}
          >
            {getClientStatusLabel(client.status)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {(client.farms ?? []).length > 0 ? (
            client.farms?.map((farm) => (
              <Badge key={farm.id} variant="outline" className="border-primary/20 bg-primary/5">
                <Leaf className="mr-1 size-3" />
                {farm.name} · {getSpeciesLabel(farm.speciesType)}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="border-dashed text-muted-foreground">
              Sin granjas asociadas
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-primary/10 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <Building2 className="size-3.5" />
              Granjas
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{client._count?.farms ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-accent/20 bg-accent/10 p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <FileText className="size-3.5" />
              Casos
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{client._count?.cases ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <MapPin className="size-3.5" />
              Visitas
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{client._count?.visits ?? 0}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            {client.phone || 'Sin teléfono'} {client.address ? `· ${client.address}` : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" className="h-9 px-3">
              <Link href={`/admin/visits?clientId=${client.id}`}>Visitas</Link>
            </Button>
            <Button asChild variant="outline" className="border-primary/20 bg-background/60">
              <Link href={`/admin/clients/${client.id}`}>
                Abrir perfil
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
