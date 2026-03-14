import Link from 'next/link'
import { ArrowLeft, PencilLine } from 'lucide-react'
import { FarmForm } from '@/components/admin/farm-form'
import { fetchClients } from '../../../clients/_lib/server-clients'
import { fetchAdvisorOptions } from '../../../_lib/server-advisors'
import { fetchFarm } from '../../_lib/server-farms'

interface EditFarmPageProps {
  params: Promise<{ id: string }>
}

export default async function EditFarmPage({ params }: EditFarmPageProps) {
  const { id } = await params
  const [farm, clients, advisors] = await Promise.all([
    fetchFarm(id),
    fetchClients({ limit: 100, status: 'active' }),
    fetchAdvisorOptions(),
  ])

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href={`/admin/farms/${farm.id}`} label="Volver a la ficha" />
      </div>

      <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
        <div className="border-b border-border/60 bg-gradient-to-r from-primary/10 via-background to-transparent p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <PencilLine className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Editar granja</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajusta productor, especie, capacidad y responsable sin perder trazabilidad operativa.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <FarmForm
            advisors={advisors}
            clients={clients.items}
            mode="edit"
            farm={farm}
          />
        </div>
      </section>
    </div>
  )
}

function ButtonLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  )
}
