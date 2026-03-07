import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  WeightChart,
  FeedConsumptionChart,
  WaterQualityChart,
  NitrogenChart,
  MortalityChart,
  FcaChart,
  TreatmentEffectivenessChart,
} from '@/components/analytics-charts'
import { requireAdminUser } from '@/lib/auth/roles'
import { ArrowLeft, Bell, Fish, Users, Waves } from 'lucide-react'

export default async function AdminProducerDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const { supabase } = await requireAdminUser()

  const { data: organization } = await supabase
    .from('organizations')
    .select('id, name, created_at')
    .eq('id', orgId)
    .single()

  if (!organization) notFound()

  const [{ data: profiles }, { data: ponds }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('ponds')
      .select('id, name, status')
      .eq('organization_id', orgId)
      .order('name'),
  ])

  const pondIds = (ponds ?? []).map((pond) => pond.id)

  let batches: Array<{ id: string; pond_id: string; status: string; start_date: string }> = []
  let records: Array<{
    id: string
    batch_id: string
    record_date: string
    feed_kg: number | null
    avg_weight_kg: number | null
    mortality_count: number
    temperature_c: number | null
    oxygen_mg_l: number | null
    ammonia_mg_l: number | null
    nitrite_mg_l: number | null
    nitrate_mg_l: number | null
    ph: number | null
    calculated_fca: number | null
    calculated_biomass_kg: number | null
    pond_name: string
  }> = []
  let treatments: Array<{
    treatment_date: string
    pond_name: string
    product_name: string
    dose_liters: number
    ammonia_before: number | null
    ammonia_after: number | null
  }> = []
  let alerts: Array<{
    id: string
    severity: string
    alert_type: string
    message: string
    is_read: boolean
    created_at: string
  }> = []

  if (pondIds.length > 0) {
    const [batchesResult, recordsResult, treatmentsResult, alertsResult] = await Promise.all([
      supabase.from('batches').select('id, pond_id, status, start_date').in('pond_id', pondIds),
      supabase
        .from('production_records')
        .select(
          'id, batch_id, record_date, feed_kg, avg_weight_kg, mortality_count, temperature_c, oxygen_mg_l, ammonia_mg_l, nitrite_mg_l, nitrate_mg_l, ph, calculated_fca, calculated_biomass_kg'
        )
        .order('record_date', { ascending: true })
        .limit(3000),
      supabase
        .from('bioremediation_treatments')
        .select('pond_id, treatment_date, product_name, dose_liters, ammonia_before, ammonia_after')
        .in('pond_id', pondIds)
        .order('treatment_date', { ascending: true }),
      supabase
        .from('alerts')
        .select('id, severity, alert_type, message, is_read, created_at, pond_id')
        .in('pond_id', pondIds)
        .order('created_at', { ascending: false })
        .limit(120),
    ])

    const pondMap = new Map((ponds ?? []).map((pond) => [pond.id, pond]))

    if (!batchesResult.error) {
      batches = batchesResult.data ?? []
      const batchPondMap = new Map(batches.map((batch) => [batch.id, batch.pond_id]))

      if (!recordsResult.error) {
        records = (recordsResult.data ?? []).map((record) => ({
          ...record,
          pond_name: pondMap.get(batchPondMap.get(record.batch_id) || '')?.name || '-',
        })) as typeof records
      }
    }

    if (!treatmentsResult.error) {
      treatments = (treatmentsResult.data ?? []).map((treatment) => ({
        ...treatment,
        pond_name: pondMap.get(treatment.pond_id)?.name || '-',
      })) as typeof treatments
    }

    if (!alertsResult.error) {
      alerts = alertsResult.data ?? []
    }
  }

  const producerCount = (profiles ?? []).filter((profile) => profile.role === 'operario').length
  const activeBatches = batches.filter((batch) => batch.status === 'active').length
  const unreadAlerts = alerts.filter((alert) => !alert.is_read).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/producers" className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Volver a Productores
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{organization.name}</h2>
          <p className="mt-1 text-muted-foreground">Drill-down de la granja: usuarios, operación y calidad de agua</p>
        </div>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Estanques</CardTitle>
            <Waves className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{ponds?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lotes activos</CardTitle>
            <Fish className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{activeBatches}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alertas no leidas</CardTitle>
            <Bell className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{unreadAlerts}</p>
          </CardContent>
        </Card>
      </div>

      {records.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-2">
          <WeightChart records={records} />
          <FcaChart records={records} />
          <FeedConsumptionChart records={records} />
          <WaterQualityChart records={records} />
          <NitrogenChart records={records} />
          <TreatmentEffectivenessChart treatments={treatments} />
          <MortalityChart records={records} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usuarios de la granja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Nombre</th>
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Email</th>
                    <th className="py-2 pr-0 font-medium text-muted-foreground">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {(profiles ?? []).map((profile) => (
                    <tr key={profile.id} className="border-b border-border/70">
                      <td className="py-2 pr-3 text-foreground">{profile.full_name || '-'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{profile.email || '-'}</td>
                      <td className="py-2 pr-0 text-muted-foreground">
                        <Badge variant={profile.role === 'admin' ? 'default' : 'secondary'}>{profile.role}</Badge>
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
            <CardTitle className="text-base">Ultimas alertas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Fecha</th>
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="py-2 pr-0 font-medium text-muted-foreground">Severidad</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.slice(0, 20).map((alert) => (
                    <tr key={alert.id} className="border-b border-border/70">
                      <td className="py-2 pr-3 text-foreground">{alert.created_at.slice(0, 10)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{alert.alert_type}</td>
                      <td className="py-2 pr-0 text-muted-foreground">{alert.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
