import { Badge } from '@/components/ui/badge'
import { FarmOverview } from '@/components/portal/farm-overview'
import { fetchPortalFarms, fetchPortalVisits } from '@/app/(portal)/portal/_lib/server-portal'

export async function PortalFarmView() {
  const [farmsResponse, visitsResponse] = await Promise.all([
    fetchPortalFarms(),
    fetchPortalVisits(),
  ])

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-primary/10 bg-white/90 p-6 shadow-sm">
        <div className="space-y-3">
          <Badge className="w-fit bg-primary/10 text-primary hover:bg-primary/10">
            Granjas
          </Badge>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Operación productiva y visitas técnicas
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Consulta la información visible de tus granjas, la capacidad operativa y el historial de visitas con observaciones y recomendaciones.
            </p>
          </div>
        </div>
      </section>

      <FarmOverview farms={farmsResponse.items} visits={visitsResponse.items} />
    </div>
  )
}
