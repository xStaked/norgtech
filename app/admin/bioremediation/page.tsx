import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { requireAdminUser } from '@/lib/auth/roles'
import { Droplets, FlaskConical, TestTube2 } from 'lucide-react'
import { CsvExportButton } from '@/components/admin/csv-export-button'

export default async function AdminBioremediationPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; product?: string }>
}) {
  const { org, product } = await searchParams
  const selectedOrg = org && org !== 'all' ? org : null
  const selectedProduct = product && product !== 'all' ? product : null

  const { supabase } = await requireAdminUser()

  const [orgsRes, pondsRes, profilesRes, treatmentsRes, calcsRes] = await Promise.allSettled([
    supabase.from('organizations').select('id, name').order('name'),
    supabase.from('ponds').select('id, name, organization_id').order('name'),
    supabase.from('profiles').select('id, full_name, organization_id'),
    supabase
      .from('bioremediation_treatments')
      .select('id, pond_id, treatment_date, product_name, dose_liters, ammonia_before, ammonia_after, notes, user_id')
      .order('treatment_date', { ascending: false })
      .limit(500),
    supabase
      .from('bioremediation_calcs')
      .select('id, user_id, volume_m3, bioremediation_dose, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const orgs = orgsRes.status === 'fulfilled' ? orgsRes.value.data ?? [] : []
  const ponds = pondsRes.status === 'fulfilled' ? pondsRes.value.data ?? [] : []
  const profiles = profilesRes.status === 'fulfilled' ? profilesRes.value.data ?? [] : []
  const rawTreatments = treatmentsRes.status === 'fulfilled' ? treatmentsRes.value.data ?? [] : []
  const calcs = calcsRes.status === 'fulfilled' ? calcsRes.value.data ?? [] : []

  const orgMap = new Map(orgs.map((o) => [o.id, o.name]))
  const pondMap = new Map(ponds.map((p) => [p.id, p]))
  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  const treatments = rawTreatments
    .map((t) => {
      const pond = pondMap.get(t.pond_id)
      const orgId = pond?.organization_id ?? null
      const before = t.ammonia_before != null ? Number(t.ammonia_before) : null
      const after = t.ammonia_after != null ? Number(t.ammonia_after) : null
      const effectiveness =
        before != null && after != null && before > 0 ? ((before - after) / before) * 100 : null

      return {
        ...t,
        orgId,
        orgName: orgMap.get(orgId || '') || '-',
        pondName: pond?.name || '-',
        effectiveness,
      }
    })
    .filter((t) => (selectedOrg ? t.orgId === selectedOrg : true))
    .filter((t) =>
      selectedProduct ? t.product_name.toLowerCase() === selectedProduct.toLowerCase() : true
    )

  const calcRows = calcs
    .map((calc) => {
      const profile = profileMap.get(calc.user_id)
      const orgId = profile?.organization_id ?? null
      return {
        ...calc,
        orgId,
        orgName: orgMap.get(orgId || '') || '-',
        userName: profile?.full_name || '-',
      }
    })
    .filter((row) => (selectedOrg ? row.orgId === selectedOrg : true))

  const totalDose = treatments.reduce((acc, t) => acc + (Number(t.dose_liters) || 0), 0)
  const avgEffectiveness =
    treatments.filter((t) => t.effectiveness != null).length > 0
      ? treatments
          .filter((t) => t.effectiveness != null)
          .reduce((acc, t) => acc + (t.effectiveness || 0), 0) /
        treatments.filter((t) => t.effectiveness != null).length
      : null

  const productOptions = Array.from(new Set(rawTreatments.map((t) => t.product_name))).sort((a, b) =>
    a.localeCompare(b)
  )

  const treatmentsExportRows = treatments.map((row) => ({
    fecha: row.treatment_date,
    granja: row.orgName,
    estanque: row.pondName,
    producto: row.product_name,
    dosis_litros: Number(row.dose_liters).toFixed(2),
    amonia_antes: row.ammonia_before ?? '',
    amonia_despues: row.ammonia_after ?? '',
    efectividad_pct: row.effectiveness != null ? row.effectiveness.toFixed(2) : '',
  }))

  const calcsExportRows = calcRows.map((row) => ({
    fecha: row.created_at.slice(0, 10),
    granja: row.orgName,
    usuario: row.userName,
    volumen_m3: Number(row.volume_m3).toFixed(1),
    dosis: row.bioremediation_dose != null ? Number(row.bioremediation_dose).toFixed(2) : '',
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Bioremediacion Global</h2>
          <p className="mt-1 text-muted-foreground">Seguimiento de tratamientos y calculos de dosis en todos los productores</p>
        </div>

        <form className="flex flex-wrap items-center gap-2" method="GET">
          <select
            id="org"
            name="org"
            defaultValue={selectedOrg ?? 'all'}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todas las granjas</option>
            {orgs.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <select
            id="product"
            name="product"
            defaultValue={selectedProduct ?? 'all'}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todos los productos</option>
            {productOptions.map((name) => (
              <option key={name} value={name}>
                {name}
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
            rows={treatmentsExportRows}
            filename={`admin_bioremediacion_tratamientos_${new Date().toISOString().slice(0, 10)}.csv`}
            label="Exportar tratamientos"
          />
          <CsvExportButton
            rows={calcsExportRows}
            filename={`admin_bioremediacion_calculos_${new Date().toISOString().slice(0, 10)}.csv`}
            label="Exportar calculos"
          />
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tratamientos</CardTitle>
            <FlaskConical className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{treatments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dosis total (L)</CardTitle>
            <Droplets className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{totalDose.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Efectividad media</CardTitle>
            <TestTube2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {avgEffectiveness != null ? `${avgEffectiveness.toFixed(1)}%` : '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tratamientos registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Granja</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Estanque</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Producto</th>
                  <th className="py-2 pr-3 text-right font-medium text-muted-foreground">Dosis (L)</th>
                  <th className="py-2 pr-0 text-right font-medium text-muted-foreground">Efectividad</th>
                </tr>
              </thead>
              <tbody>
                {treatments.slice(0, 80).map((treatment) => (
                  <tr key={treatment.id} className="border-b border-border/70">
                    <td className="py-2 pr-3 text-foreground">{treatment.treatment_date}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{treatment.orgName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{treatment.pondName}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="secondary">{treatment.product_name}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{Number(treatment.dose_liters).toFixed(2)}</td>
                    <td className="py-2 pr-0 text-right text-muted-foreground">
                      {treatment.effectiveness != null ? `${treatment.effectiveness.toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calculos de bioremediacion (historico)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Granja</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Usuario</th>
                  <th className="py-2 pr-3 text-right font-medium text-muted-foreground">Volumen (m3)</th>
                  <th className="py-2 pr-0 text-right font-medium text-muted-foreground">Dosis</th>
                </tr>
              </thead>
              <tbody>
                {calcRows.slice(0, 80).map((row) => (
                  <tr key={row.id} className="border-b border-border/70">
                    <td className="py-2 pr-3 text-foreground">{row.created_at.slice(0, 10)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.orgName}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.userName}</td>
                    <td className="py-2 pr-3 text-right text-muted-foreground">{Number(row.volume_m3).toFixed(1)}</td>
                    <td className="py-2 pr-0 text-right text-muted-foreground">
                      {row.bioremediation_dose != null ? Number(row.bioremediation_dose).toFixed(2) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
