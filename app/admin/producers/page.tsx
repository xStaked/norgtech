import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { requireAdminUser } from '@/lib/auth/roles'
import { Building2, Fish, Users, Waves } from 'lucide-react'
import { CsvExportButton } from '@/components/admin/csv-export-button'
import Link from 'next/link'

export default async function AdminProducersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>
}) {
  const { org } = await searchParams
  const selectedOrg = org && org !== 'all' ? org : null

  const { supabase } = await requireAdminUser()

  const [orgsRes, profilesRes, pondsRes, batchesRes, recordsRes] = await Promise.allSettled([
    supabase.from('organizations').select('id, name, created_at').order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name, email, role, organization_id, created_at')
      .order('created_at', { ascending: false })
      .limit(250),
    supabase.from('ponds').select('id, organization_id, name').order('created_at', { ascending: false }),
    supabase.from('batches').select('id, pond_id, status, created_at').order('created_at', { ascending: false }),
    supabase
      .from('production_records')
      .select('id, batch_id, record_date, feed_kg, avg_weight_kg, mortality_count')
      .order('record_date', { ascending: false })
      .limit(300),
  ])

  const orgs = orgsRes.status === 'fulfilled' ? orgsRes.value.data ?? [] : []
  const profiles = profilesRes.status === 'fulfilled' ? profilesRes.value.data ?? [] : []
  const ponds = pondsRes.status === 'fulfilled' ? pondsRes.value.data ?? [] : []
  const batches = batchesRes.status === 'fulfilled' ? batchesRes.value.data ?? [] : []
  const records = recordsRes.status === 'fulfilled' ? recordsRes.value.data ?? [] : []

  const orgMap = new Map(orgs.map((o) => [o.id, o.name]))
  const pondOrgMap = new Map(ponds.map((p) => [p.id, p.organization_id]))
  const batchOrgMap = new Map(batches.map((b) => [b.id, pondOrgMap.get(b.pond_id) ?? null]))

  const scopedProfiles = selectedOrg
    ? profiles.filter((p) => p.organization_id === selectedOrg)
    : profiles

  const scopedPonds = selectedOrg
    ? ponds.filter((p) => p.organization_id === selectedOrg)
    : ponds

  const scopedBatches = selectedOrg
    ? batches.filter((b) => pondOrgMap.get(b.pond_id) === selectedOrg)
    : batches

  const scopedRecords = selectedOrg
    ? records.filter((r) => batchOrgMap.get(r.batch_id) === selectedOrg)
    : records

  const producerCount = scopedProfiles.filter((p) => p.role === 'operario').length
  const adminCount = scopedProfiles.filter((p) => p.role === 'admin').length
  const activeBatchCount = scopedBatches.filter((b) => b.status === 'active').length

  const orgSummary = orgs
    .map((organization) => {
      const organizationProfiles = profiles.filter((p) => p.organization_id === organization.id)
      const organizationPonds = ponds.filter((p) => p.organization_id === organization.id)
      const organizationPondIds = new Set(organizationPonds.map((p) => p.id))
      const organizationBatches = batches.filter((b) => organizationPondIds.has(b.pond_id))
      const organizationBatchIds = new Set(organizationBatches.map((b) => b.id))
      const organizationRecords = records.filter((r) => organizationBatchIds.has(r.batch_id))

      return {
        id: organization.id,
        name: organization.name,
        producers: organizationProfiles.filter((p) => p.role === 'operario').length,
        admins: organizationProfiles.filter((p) => p.role === 'admin').length,
        ponds: organizationPonds.length,
        activeBatches: organizationBatches.filter((b) => b.status === 'active').length,
        records: organizationRecords.length,
      }
    })
    .sort((a, b) => b.records - a.records)

  const usersExportRows = scopedProfiles.map((profile) => ({
    nombre: profile.full_name || '',
    email: profile.email || '',
    rol: profile.role,
    granja: orgMap.get(profile.organization_id || '') || '-',
    creado: profile.created_at?.slice(0, 10) || '',
  }))

  const recordsExportRows = scopedRecords.map((record) => ({
    fecha: record.record_date,
    granja: orgMap.get(batchOrgMap.get(record.batch_id) || '') || '-',
    alimento_kg: record.feed_kg ?? '',
    peso_kg: record.avg_weight_kg ?? '',
    mortalidad: record.mortality_count ?? 0,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Datos de Productores</h2>
          <p className="mt-1 text-muted-foreground">Visión global de clientes, usuarios y actividad productiva</p>
        </div>

        <form className="flex items-center gap-2" method="GET">
          <label htmlFor="org" className="text-xs text-muted-foreground">Organizacion</label>
          <select
            id="org"
            name="org"
            defaultValue={selectedOrg ?? 'all'}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todas</option>
            {orgs.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            Filtrar
          </button>
          <CsvExportButton
            rows={usersExportRows}
            filename={`admin_productores_${new Date().toISOString().slice(0, 10)}.csv`}
            label="Exportar usuarios"
          />
          <CsvExportButton
            rows={recordsExportRows}
            filename={`admin_registros_${new Date().toISOString().slice(0, 10)}.csv`}
            label="Exportar registros"
          />
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Productores</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{producerCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Admins</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{adminCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estanques</CardTitle>
            <Waves className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{scopedPonds.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lotes activos</CardTitle>
            <Fish className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{activeBatchCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organizaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Granja</th>
                    <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Prod.</th>
                    <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estanques</th>
                    <th className="py-2 pr-0 font-medium text-muted-foreground text-right">Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {orgSummary
                    .filter((row) => !selectedOrg || row.id === selectedOrg)
                    .map((row) => (
                      <tr key={row.id} className="border-b border-border/70">
                        <td className="py-2 pr-3 text-foreground">
                          <Link href={`/admin/producers/${row.id}`} className="hover:underline">
                            {row.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">{row.producers}</td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">{row.ponds}</td>
                        <td className="py-2 pr-0 text-right text-muted-foreground">{row.records}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ultimos usuarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Nombre</th>
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Rol</th>
                    <th className="py-2 pr-0 font-medium text-muted-foreground">Granja</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedProfiles.slice(0, 12).map((profile) => (
                    <tr key={profile.id} className="border-b border-border/70">
                      <td className="py-2 pr-3 text-foreground">{profile.full_name || profile.email || '-'}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={profile.role === 'admin' ? 'default' : 'secondary'}>{profile.role}</Badge>
                      </td>
                      <td className="py-2 pr-0 text-muted-foreground">{orgMap.get(profile.organization_id || '') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registros productivos recientes (global)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Granja</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Alimento (kg)</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Peso (kg)</th>
                  <th className="py-2 pr-0 font-medium text-muted-foreground text-right">Mortalidad</th>
                </tr>
              </thead>
              <tbody>
                {scopedRecords.slice(0, 20).map((record) => {
                  const organizationId = batchOrgMap.get(record.batch_id)
                  return (
                    <tr key={record.id} className="border-b border-border/70">
                      <td className="py-2 pr-3 text-foreground">{record.record_date}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{orgMap.get(organizationId || '') || '-'}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{record.feed_kg?.toFixed(1) ?? '-'}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{record.avg_weight_kg?.toFixed(3) ?? '-'}</td>
                      <td className="py-2 pr-0 text-right text-muted-foreground">{record.mortality_count ?? 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
