import Link from 'next/link'
import { ChevronLeft, Sprout } from 'lucide-react'
import { ClientForm } from '@/components/admin/client-form'
import { fetchAdvisorOptions } from '../../_lib/server-advisors'

export default async function NewClientPage() {
  const advisors = await fetchAdvisorOptions()

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,_rgba(240,253,244,0.82),_rgba(255,255,255,0.94))] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Volver al CRM
        </Link>

        <section className="rounded-[2rem] border border-primary/10 bg-card p-8 shadow-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
              <Sprout className="size-3.5" />
              Alta de productor
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Crear un nuevo productor
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Registra la base del perfil comercial para empezar a conectar granjas, casos técnicos y visitas.
            </p>
          </div>

          <div className="mt-8">
            <ClientForm advisors={advisors} mode="create" />
          </div>
        </section>
      </div>
    </div>
  )
}
