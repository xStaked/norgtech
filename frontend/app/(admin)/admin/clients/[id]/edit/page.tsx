import Link from 'next/link'
import { ChevronLeft, PencilLine } from 'lucide-react'
import { ClientForm } from '@/components/admin/client-form'
import { fetchAdvisorOptions } from '../../../_lib/server-advisors'
import { fetchClient } from '../../_lib/server-clients'

interface EditClientPageProps {
  params: Promise<{ id: string }>
}

export default async function EditClientPage({ params }: EditClientPageProps) {
  const { id } = await params
  const [client, advisors] = await Promise.all([fetchClient(id), fetchAdvisorOptions()])

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(240,253,244,0.74))] p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Link
          href={`/admin/clients/${client.id}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Volver al perfil
        </Link>

        <section className="rounded-[2rem] border border-primary/10 bg-card p-8 shadow-sm">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
              <PencilLine className="size-3.5" />
              Ajuste de perfil
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Editar productor
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Actualiza la información base para que el equipo mantenga consistencia comercial y trazabilidad técnica.
            </p>
          </div>

          <div className="mt-8">
            <ClientForm advisors={advisors} mode="edit" client={client} />
          </div>
        </section>
      </div>
    </div>
  )
}
