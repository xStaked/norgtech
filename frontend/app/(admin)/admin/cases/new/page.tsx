import Link from 'next/link'
import { ChevronLeft, Siren } from 'lucide-react'
import { CaseForm } from '@/components/admin/case-form'
import { fetchClients } from '../../clients/_lib/server-clients'
import { fetchFarms } from '../../farms/_lib/server-farms'
import { fetchAdvisorOptions } from '../../_lib/server-advisors'

export default async function NewCasePage() {
  const [clients, farms, advisors] = await Promise.all([
    fetchClients({ limit: 100, status: 'active' }),
    fetchFarms(),
    fetchAdvisorOptions(),
  ])

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,_rgba(255,247,237,0.75),_rgba(255,255,255,0.95))] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Link
          href="/admin/cases"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Volver a casos
        </Link>

        <section className="rounded-[2rem] border border-orange-200 bg-card p-8 shadow-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-orange-700">
              <Siren className="size-3.5" />
              Alta de caso técnico
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Registrar un nuevo caso
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Consolida el incidente con productor, granja, severidad y técnico responsable para activar el seguimiento del equipo.
            </p>
          </div>

          <div className="mt-8">
            <CaseForm
              advisors={advisors}
              clients={clients.items}
              farms={farms.items}
              mode="create"
            />
          </div>
        </section>
      </div>
    </div>
  )
}
