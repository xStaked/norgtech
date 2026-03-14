import { ArrowLeft, Orbit } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FarmForm } from '@/components/admin/farm-form'
import { fetchClients } from '../../clients/_lib/server-clients'
import { fetchAdvisorOptions } from '../../_lib/server-advisors'

export default async function NewFarmPage() {
  const [clients, advisors] = await Promise.all([
    fetchClients({ limit: 100, status: 'active' }),
    fetchAdvisorOptions(),
  ])

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" className="pl-0">
          <Link href="/admin/farms">
            <ArrowLeft className="size-4" />
            Volver a granjas
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden border-primary/10 bg-card/95 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-gradient-to-r from-primary/10 via-background to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Orbit className="size-5" />
            </div>
            <div>
              <CardTitle className="text-2xl">Nueva granja</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Registra la unidad productiva y déjala lista para casos técnicos, visitas y KPIs de operación.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <FarmForm advisors={advisors} clients={clients.items} mode="create" />
        </CardContent>
      </Card>
    </div>
  )
}
