import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createInvitationCode } from '@/app/admin/actions'
import { requireAdminUser } from '@/lib/auth/roles'
import { Building2, Users, Waves, Fish, Ticket, UserRound, ArrowRight } from 'lucide-react'
import type { ComponentType } from 'react'
import Link from 'next/link'

type Kpi = {
  title: string
  value: number
  description: string
  icon: ComponentType<{ className?: string }>
}

export default async function AdminPage() {
  const { supabase } = await requireAdminUser()

  const [orgsRes, producersRes, pondsRes, activeBatchesRes, openCodesRes, latestProfilesRes] = await Promise.allSettled([
    supabase.from('organizations').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'operario'),
    supabase.from('ponds').select('*', { count: 'exact', head: true }),
    supabase.from('batches').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('invitation_codes').select('*', { count: 'exact', head: true }).eq('used', false),
    supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at, organizations(name)')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const kpis: Kpi[] = [
    {
      title: 'Granjas',
      value: orgsRes.status === 'fulfilled' ? orgsRes.value.count ?? 0 : 0,
      description: 'Organizaciones registradas',
      icon: Building2,
    },
    {
      title: 'Productores',
      value: producersRes.status === 'fulfilled' ? producersRes.value.count ?? 0 : 0,
      description: 'Usuarios operarios',
      icon: Users,
    },
    {
      title: 'Estanques',
      value: pondsRes.status === 'fulfilled' ? pondsRes.value.count ?? 0 : 0,
      description: 'Total en plataforma',
      icon: Waves,
    },
    {
      title: 'Lotes activos',
      value: activeBatchesRes.status === 'fulfilled' ? activeBatchesRes.value.count ?? 0 : 0,
      description: 'Produccion en curso',
      icon: Fish,
    },
  ]

  const openCodes = openCodesRes.status === 'fulfilled' ? openCodesRes.value.count ?? 0 : 0
  const latestProfiles = latestProfilesRes.status === 'fulfilled' ? latestProfilesRes.value.data ?? [] : []

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">Panel Administrativo</h2>
        <p className="mt-1 text-muted-foreground">Operacion global de clientes, usuarios y crecimiento de AquaData</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.title} className="transition-shadow duration-200 hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-foreground">{kpi.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ticket className="h-4 w-4 text-primary" />
              Codigos de invitacion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Codigos disponibles</p>
              <p className="text-2xl font-semibold text-foreground">{openCodes}</p>
            </div>

            <form action={createInvitationCode} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="code" className="text-xs text-muted-foreground">Codigo (opcional)</label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  placeholder="AQUA-EMPRESA-2026"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="description" className="text-xs text-muted-foreground">Descripcion</label>
                <input
                  id="description"
                  name="description"
                  type="text"
                  placeholder="Cliente piloto"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Crear codigo
              </button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4 text-primary" />
              Ultimos usuarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Nombre</th>
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Email</th>
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Rol</th>
                    <th className="py-2 pr-0 font-medium text-muted-foreground">Granja</th>
                  </tr>
                </thead>
                <tbody>
                  {latestProfiles.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground">Sin datos disponibles</td>
                    </tr>
                  )}
                  {latestProfiles.map((profile) => {
                    const org = profile.organizations as unknown as { name?: string } | null
                    return (
                      <tr key={profile.id} className="border-b border-border/70">
                        <td className="py-3 pr-3 text-foreground">{profile.full_name || '-'}</td>
                        <td className="py-3 pr-3 text-muted-foreground">{profile.email || '-'}</td>
                        <td className="py-3 pr-3">
                          <Badge variant={profile.role === 'admin' ? 'default' : 'secondary'}>{profile.role}</Badge>
                        </td>
                        <td className="py-3 pr-0 text-muted-foreground">{org?.name || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modulos administrativos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              {
                href: '/admin/producers',
                title: 'Productores',
                description: 'Clientes, usuarios, granjas y registros globales',
              },
              {
                href: '/admin/bioremediation',
                title: 'Bioremediacion',
                description: 'Tratamientos, dosis y efectividad por granja',
              },
              {
                href: '/admin/analytics',
                title: 'Analiticas',
                description: 'Tendencias operativas y riesgos por periodo',
              },
            ].map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <p className="flex items-center justify-between font-medium text-foreground">
                  {module.title}
                  <ArrowRight className="h-4 w-4 text-primary" />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
