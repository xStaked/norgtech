import Link from 'next/link'
import { ChevronLeft, MapPin } from 'lucide-react'
import { VisitForm } from '@/components/admin/visit-form'
import { fetchCases } from '../../cases/_lib/server-cases'
import { fetchClients } from '../../clients/_lib/server-clients'
import { fetchFarms } from '../../farms/_lib/server-farms'
import { fetchAdvisorOptions } from '../../_lib/server-advisors'

interface NewVisitPageProps {
  searchParams: Promise<{
    clientId?: string
    farmId?: string
    caseId?: string
    advisorId?: string
    visitDate?: string
  }>
}

export default async function NewVisitPage({ searchParams }: NewVisitPageProps) {
  const params = await searchParams
  const [advisors, clients, farms, cases] = await Promise.all([
    fetchAdvisorOptions(),
    fetchClients({ limit: 100, status: 'active' }),
    fetchFarms(),
    fetchCases({ limit: 100 }),
  ])

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,_rgba(240,253,244,0.72),_rgba(255,255,255,0.96))] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Link
          href="/admin/visits"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Volver a visitas
        </Link>

        <section className="rounded-[2rem] border border-primary/10 bg-card p-8 shadow-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-700">
              <MapPin className="size-3.5" />
              Salida técnica
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Registrar visita de campo
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Documenta la visita con métricas por especie, observaciones y recomendaciones para que el historial operativo quede completo.
            </p>
          </div>

          <div className="mt-8">
            <VisitForm
              advisors={advisors}
              clients={clients.items}
              farms={farms.items}
              cases={cases.items}
              mode="create"
              initialValues={{
                clientId: params.clientId ?? '',
                farmId: params.farmId ?? '',
                caseId: params.caseId ?? '',
                advisorId: params.advisorId ?? '',
                visitDate: params.visitDate ?? '',
              }}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
